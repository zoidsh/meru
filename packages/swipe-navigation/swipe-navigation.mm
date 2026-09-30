// Two-finger history swiping for macOS, as a Node-API addon.
//
// AppKit is the only source of the gesture: `trackSwipeEventWithOptions` owns
// the rubber-band physics and decides at release whether the swipe completed.
// The scroll events of a tracked gesture are swallowed in the event monitor
// below, so the page under the pointer does not scroll as well. What is left
// here is the decision to start tracking, which is asked of JavaScript, and the
// arrow bubble, which has to be a native view because Chromium's render widgets
// are siblings in the window and paint over anything the renderer draws.

#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>

#include <node_api.h>

#include <algorithm>
#include <cmath>
#include <cstring>

namespace {

struct Tuning {
  double arrivalProgress;
  double completionAmount;
  double horizontalDominanceRatio;
  double minimumHorizontalDelta;
  double maximumVerticalDelta;
  double overlayDiameter;
  double overlayMaxOffset;
  double overlayArrivingOpacity;
  double overlayFadeInProgress;
  double overlayFadeOutDuration;
};

Tuning g_tuning = {};

// Null once the Node environment has gone, which is what every path into
// JavaScript checks: AppKit outlives it, and a scroll event or a settling
// tracker afterwards would call into a torn-down environment.
napi_env g_env = nullptr;
napi_ref g_on_begin = nullptr;
napi_ref g_on_progress = nullptr;
napi_ref g_on_end = nullptr;
bool g_cleanup_hook_added = false;

// AppKit calls in from outside any Node callback, so every call to JavaScript
// goes through this resource: `napi_make_callback` then drains the microtask
// queue and the `nextTick` queue the handlers leave behind, as an asynchronous
// completion would.
napi_ref g_async_resource = nullptr;
napi_async_context g_async_context = nullptr;

// The accumulated scroll of the gesture being considered, reset by every
// `NSEventPhaseBegan`. A gesture that has been refused is refused for the rest
// of its life, so that turning a vertical scroll horizontal halfway through
// cannot navigate.
NSSize g_pending_delta = NSZeroSize;
bool g_pending_refused = false;
bool g_pending_while_settling = false;

bool g_tracking = false;
bool g_tracking_released = false;
int32_t g_tracking_generation = 0;
int32_t g_tracking_id = 0;
double g_tracking_max_progress = 0;
NSString* g_tracking_direction = nil;

}  // namespace

@interface MeruSwipeOverlay : NSView

@property(nonatomic) CGFloat progress;

@property(nonatomic) BOOL fromLeftEdge;

@end

@implementation MeruSwipeOverlay

- (BOOL)isFlipped {
  return YES;
}

// The bubble is over web content the pointer still has to reach.
- (NSView*)hitTest:(NSPoint)point {
  return nil;
}

- (void)setProgress:(CGFloat)progress {
  _progress = progress;

  self.needsDisplay = YES;
}

- (void)drawRect:(NSRect)dirtyRect {
  const CGFloat progress = std::clamp(static_cast<double>(self.progress), 0.0, 1.0);

  if (progress <= 0) {
    return;
  }

  const CGFloat arrival = std::min(1.0, progress / std::max(0.001, g_tuning.arrivalProgress));

  const CGFloat diameter = g_tuning.overlayDiameter;
  const CGFloat radius = diameter / 2;
  const CGFloat inset = -radius + arrival * (g_tuning.overlayMaxOffset + radius);
  const CGFloat centerX = self.fromLeftEdge ? inset : NSWidth(self.bounds) - inset;
  const CGFloat centerY = NSMidY(self.bounds);

  const NSRect circle =
      NSMakeRect(centerX - radius, centerY - radius, diameter, diameter);

  // Chrome's cue that letting go now navigates is the bubble going opaque as
  // it arrives, rather than a change of colour.
  const CGFloat opacity =
      g_tuning.overlayArrivingOpacity + arrival * (1 - g_tuning.overlayArrivingOpacity);
  const CGFloat alpha =
      opacity * std::min(1.0, progress / std::max(0.001, g_tuning.overlayFadeInProgress));

  NSGraphicsContext* context = NSGraphicsContext.currentContext;

  [context saveGraphicsState];

  // Blurred without an offset, so it reads the same whichever way the
  // superview's y axis runs.
  NSShadow* shadow = [[NSShadow alloc] init];
  shadow.shadowColor = [NSColor.shadowColor colorWithAlphaComponent:0.3 * alpha];
  shadow.shadowBlurRadius = 10;
  shadow.shadowOffset = NSZeroSize;
  [shadow set];

  [[NSColor.controlBackgroundColor colorWithAlphaComponent:alpha] setFill];
  [[NSBezierPath bezierPathWithOvalInRect:circle] fill];

  [context restoreGraphicsState];

  NSBezierPath* ring = [NSBezierPath bezierPathWithOvalInRect:NSInsetRect(circle, 0.5, 0.5)];
  ring.lineWidth = 1;
  [[NSColor.separatorColor colorWithAlphaComponent:alpha] setStroke];
  [ring stroke];

  const CGFloat chevronHalfHeight = diameter * 0.17;
  const CGFloat chevronHalfWidth = diameter * 0.11;
  const CGFloat tipX = self.fromLeftEdge ? centerX - chevronHalfWidth : centerX + chevronHalfWidth;
  const CGFloat baseX = self.fromLeftEdge ? centerX + chevronHalfWidth : centerX - chevronHalfWidth;

  NSBezierPath* chevron = [NSBezierPath bezierPath];
  [chevron moveToPoint:NSMakePoint(baseX, centerY - chevronHalfHeight)];
  [chevron lineToPoint:NSMakePoint(tipX, centerY)];
  [chevron lineToPoint:NSMakePoint(baseX, centerY + chevronHalfHeight)];
  chevron.lineWidth = std::max(2.0, diameter * 0.07);
  chevron.lineCapStyle = NSLineCapStyleRound;
  chevron.lineJoinStyle = NSLineJoinStyleRound;

  [[NSColor.secondaryLabelColor colorWithAlphaComponent:alpha] setStroke];
  [chevron stroke];
}

@end

namespace {

id g_monitor = nil;
MeruSwipeOverlay* g_overlay = nil;

NSWindow* WindowForContentView(const void* handle) {
  for (NSWindow* window in NSApp.windows) {
    if ((__bridge const void*)window.contentView == handle) {
      return window;
    }
  }

  return nil;
}

/**
 * A rectangle given in the top-left-origin points Electron lays views out in,
 * as a frame in the window's content view.
 */
NSRect FrameInContentView(NSView* contentView, NSRect rect) {
  if (contentView.isFlipped) {
    return rect;
  }

  rect.origin.y = NSHeight(contentView.bounds) - NSMinY(rect) - NSHeight(rect);

  return rect;
}

void RemoveOverlay() {
  [g_overlay removeFromSuperview];

  g_overlay = nil;
}

void ShowOverlay(NSWindow* window, NSRect viewBounds, bool fromLeftEdge, double progress) {
  NSView* contentView = window.contentView;

  if (!contentView) {
    return;
  }

  if (g_overlay.superview != contentView) {
    RemoveOverlay();

    g_overlay = [[MeruSwipeOverlay alloc] initWithFrame:NSZeroRect];
    g_overlay.wantsLayer = YES;

    // The bubble slides in from outside the web view's edge, which past a
    // window edge is the vertical tabs strip. Linked against the macOS 14 SDK
    // or later, a view draws outside its bounds unless told not to.
    if (@available(macOS 14, *)) {
      g_overlay.clipsToBounds = YES;
    }
    g_overlay.layer.masksToBounds = YES;

    [contentView addSubview:g_overlay positioned:NSWindowAbove relativeTo:nil];
  }

  g_overlay.alphaValue = 1;
  g_overlay.frame = FrameInContentView(contentView, viewBounds);
  g_overlay.fromLeftEdge = fromLeftEdge;
  g_overlay.progress = progress;
}

void FadeOutOverlay() {
  MeruSwipeOverlay* overlay = g_overlay;

  g_overlay = nil;

  if (!overlay) {
    return;
  }

  [NSAnimationContext runAnimationGroup:^(NSAnimationContext* context) {
    context.duration = g_tuning.overlayFadeOutDuration / 1000;

    overlay.animator.alphaValue = 0;
  }
      completionHandler:^{
        [overlay removeFromSuperview];
      }];
}

bool CallJs(napi_ref ref, size_t argc, napi_value* argv, napi_value* result) {
  if (!g_env || !ref || !g_async_context || !g_async_resource) {
    return false;
  }

  napi_value fn = nullptr;

  if (napi_get_reference_value(g_env, ref, &fn) != napi_ok || !fn) {
    return false;
  }

  napi_value resource = nullptr;

  if (napi_get_reference_value(g_env, g_async_resource, &resource) != napi_ok || !resource) {
    return false;
  }

  napi_callback_scope scope = nullptr;

  if (napi_open_callback_scope(g_env, resource, g_async_context, &scope) != napi_ok) {
    return false;
  }

  napi_value undefined = nullptr;
  napi_get_undefined(g_env, &undefined);

  const bool called =
      napi_make_callback(g_env, g_async_context, undefined, fn, argc, argv, result) == napi_ok;

  // An exception left pending would be rethrown at an unrelated point in the
  // main process, a gesture later, so it is taken before the scope closes and
  // handed to the process's uncaught handling, which Electron surfaces without
  // ending the process. The handlers catch and log for themselves, so reaching
  // here means one of them is broken.
  napi_value error = nullptr;
  bool isPending = false;
  napi_is_exception_pending(g_env, &isPending);

  if (isPending) {
    napi_get_and_clear_last_exception(g_env, &error);
  }

  napi_close_callback_scope(g_env, scope);

  if (error) {
    napi_fatal_exception(g_env, error);
  }

  return called;
}

napi_value MakeNumber(double value) {
  napi_value result = nullptr;
  napi_create_double(g_env, value, &result);

  return result;
}

bool ReadNumberProperty(napi_value object, const char* name, double* out) {
  napi_value value = nullptr;

  if (napi_get_named_property(g_env, object, name, &value) != napi_ok) {
    return false;
  }

  return napi_get_value_double(g_env, value, out) == napi_ok;
}

double ReadTuning(napi_value options, const char* name, double fallback) {
  double value = fallback;

  ReadNumberProperty(options, name, &value);

  return value;
}

struct Target {
  int32_t id;
  NSRect bounds;
};

/**
 * Asks JavaScript whether this gesture should navigate, and where the bubble
 * belongs. Synchronous because the answer decides whether the event is
 * swallowed, and safe because the event monitor runs on the thread Node's
 * loop runs on.
 */
bool AskJsToTrack(NSWindow* window, NSPoint pointInWindow, NSString* direction, Target* target) {
  if (!g_env) {
    return false;
  }

  napi_handle_scope scope = nullptr;

  if (napi_open_handle_scope(g_env, &scope) != napi_ok) {
    return false;
  }

  bool shouldTrack = false;

  napi_value request = nullptr;
  napi_create_object(g_env, &request);

  const void* handle = (__bridge const void*)window.contentView;
  napi_value windowHandle = nullptr;
  void* windowHandleData = nullptr;
  napi_create_buffer_copy(g_env, sizeof(handle), &handle, &windowHandleData, &windowHandle);
  napi_set_named_property(g_env, request, "windowHandle", windowHandle);

  napi_set_named_property(g_env, request, "x", MakeNumber(pointInWindow.x));
  napi_set_named_property(g_env, request, "y", MakeNumber(pointInWindow.y));

  napi_value directionValue = nullptr;
  napi_create_string_utf8(g_env, direction.UTF8String, NAPI_AUTO_LENGTH, &directionValue);
  napi_set_named_property(g_env, request, "direction", directionValue);

  napi_value whileSettling = nullptr;
  napi_get_boolean(g_env, g_pending_while_settling, &whileSettling);
  napi_set_named_property(g_env, request, "whileSettling", whileSettling);

  napi_value response = nullptr;

  if (CallJs(g_on_begin, 1, &request, &response)) {
    napi_valuetype type = napi_undefined;
    napi_typeof(g_env, response, &type);

    if (type == napi_object) {
      double id = 0;
      double x = 0;
      double y = 0;
      double width = 0;
      double height = 0;

      shouldTrack = ReadNumberProperty(response, "id", &id) &&
                    ReadNumberProperty(response, "x", &x) &&
                    ReadNumberProperty(response, "y", &y) &&
                    ReadNumberProperty(response, "width", &width) &&
                    ReadNumberProperty(response, "height", &height);

      if (shouldTrack) {
        target->id = static_cast<int32_t>(id);
        target->bounds = NSMakeRect(x, y, width, height);
      }
    }
  }

  napi_close_handle_scope(g_env, scope);

  return shouldTrack;
}

void ReportProgress(double progress) {
  if (!g_env || !g_on_progress) {
    return;
  }

  napi_handle_scope scope = nullptr;

  if (napi_open_handle_scope(g_env, &scope) != napi_ok) {
    return;
  }

  napi_value argv[2] = {nullptr, nullptr};
  napi_create_int32(g_env, g_tracking_id, &argv[0]);
  argv[1] = MakeNumber(progress);

  CallJs(g_on_progress, 2, argv, nullptr);

  napi_close_handle_scope(g_env, scope);
}

void ReportEnd(bool committed) {
  if (!g_env || !g_on_end) {
    return;
  }

  napi_handle_scope scope = nullptr;

  if (napi_open_handle_scope(g_env, &scope) != napi_ok) {
    return;
  }

  napi_value argv[4] = {nullptr, nullptr, nullptr, nullptr};
  napi_create_int32(g_env, g_tracking_id, &argv[0]);
  napi_create_string_utf8(g_env, g_tracking_direction.UTF8String, NAPI_AUTO_LENGTH, &argv[1]);
  napi_get_boolean(g_env, committed, &argv[2]);
  argv[3] = MakeNumber(g_tracking_max_progress);

  CallJs(g_on_end, 4, argv, nullptr);

  napi_close_handle_scope(g_env, scope);
}

bool HandleScrollWheel(NSEvent* event) {
  bool whileSettling = false;

  if (g_tracking) {
    // Once released, only the momentum still belongs to the swipe. Fingers
    // coming down again start a new gesture, which must not wait out the
    // settle animation of the last one.
    if (!(g_tracking_released && event.phase == NSEventPhaseBegan)) {
      return true;
    }

    g_tracking = false;
    g_tracking_released = false;

    whileSettling = true;
  }

  if (event.phase == NSEventPhaseBegan) {
    g_pending_delta = NSZeroSize;
    g_pending_refused = false;
    g_pending_while_settling = whileSettling;

    return false;
  }

  if (g_pending_refused || event.phase != NSEventPhaseChanged ||
      event.momentumPhase != NSEventPhaseNone || !event.hasPreciseScrollingDeltas ||
      !NSEvent.swipeTrackingFromScrollEventsEnabled) {
    return false;
  }

  NSWindow* window = event.window;
  NSView* contentView = window.contentView;

  if (!contentView) {
    return false;
  }

  g_pending_delta.width += event.scrollingDeltaX;
  g_pending_delta.height += event.scrollingDeltaY;

  if (std::abs(g_pending_delta.height) > g_tuning.maximumVerticalDelta) {
    g_pending_refused = true;

    return false;
  }

  if (std::abs(g_pending_delta.width) < g_tuning.minimumHorizontalDelta ||
      std::abs(g_pending_delta.width) <=
          std::abs(g_pending_delta.height) * g_tuning.horizontalDominanceRatio) {
    return false;
  }

  // Fingers moving right carry the content right, which uncovers what came
  // before it, so the bubble comes in at the left edge.
  NSString* direction = g_pending_delta.width > 0 ? @"left" : @"right";

  const NSPoint pointInContentView = [contentView convertPoint:event.locationInWindow fromView:nil];
  const NSPoint pointInWindow = NSMakePoint(
      pointInContentView.x, contentView.isFlipped
                                ? pointInContentView.y
                                : NSHeight(contentView.bounds) - pointInContentView.y);

  Target target = {};

  if (!AskJsToTrack(window, pointInWindow, direction, &target)) {
    g_pending_refused = true;

    return false;
  }

  // The generation is claimed before anything says a gesture is being tracked,
  // so there is no moment in which the tracker of a settling swipe finds itself
  // holding the current one.
  const int32_t generation = ++g_tracking_generation;

  g_tracking = true;
  g_tracking_released = false;
  g_tracking_id = target.id;
  g_tracking_direction = direction;
  g_tracking_max_progress = 0;

  const bool fromLeftEdge = [direction isEqualToString:@"left"];

  ShowOverlay(window, target.bounds, fromLeftEdge, 0);

  [event trackSwipeEventWithOptions:NSEventSwipeTrackingLockDirection
          dampenAmountThresholdMin:-1
                               max:1
                      usingHandler:^(CGFloat gestureAmount, NSEventPhase phase, BOOL isComplete,
                                     BOOL* stop) {
                        // First, and before every path through the block:
                        // AppKit goes on calling the tracker of a swipe that
                        // has been superseded, and it must touch neither the
                        // overlay nor the state of the one that replaced it.
                        if (!g_env || !g_tracking || generation != g_tracking_generation) {
                          *stop = YES;

                          return;
                        }

                        const double progress = std::clamp(std::abs(gestureAmount), 0.0, 1.0);

                        g_tracking_max_progress = std::max(g_tracking_max_progress, progress);

                        g_overlay.progress = progress;

                        if (!g_tracking_released) {
                          ReportProgress(progress);
                        }

                        // AppKit decides at release, with Ended or Cancelled, and
                        // then animates the amount home for up to a second before
                        // `isComplete`. Chrome navigates at release, so the
                        // decision is acted on then, and tracking goes on only to
                        // swallow the momentum that follows.
                        const bool released =
                            phase == NSEventPhaseEnded || phase == NSEventPhaseCancelled;

                        if (released && !g_tracking_released) {
                          g_tracking_released = true;

                          const bool committed = phase == NSEventPhaseEnded;

                          ReportEnd(committed);

                          if (committed) {
                            FadeOutOverlay();
                          } else {
                            RemoveOverlay();
                          }
                        }

                        if (!isComplete) {
                          return;
                        }

                        if (!g_tracking_released) {
                          const bool committed = progress >= g_tuning.completionAmount;

                          ReportEnd(committed);

                          if (committed) {
                            FadeOutOverlay();
                          } else {
                            RemoveOverlay();
                          }
                        }

                        g_tracking = false;
                        g_tracking_released = false;
                        g_pending_delta = NSZeroSize;
                        g_pending_refused = false;
                        g_tracking_direction = nil;
                      }];

  return true;
}

napi_value IsSwipeTrackingEnabled(napi_env env, napi_callback_info info) {
  napi_value result = nullptr;
  napi_get_boolean(env, NSEvent.swipeTrackingFromScrollEventsEnabled, &result);

  return result;
}

void ReleaseCallbacks() {
  if (!g_env) {
    return;
  }

  if (g_on_begin) {
    napi_delete_reference(g_env, g_on_begin);

    g_on_begin = nullptr;
  }

  if (g_on_progress) {
    napi_delete_reference(g_env, g_on_progress);

    g_on_progress = nullptr;
  }

  if (g_on_end) {
    napi_delete_reference(g_env, g_on_end);

    g_on_end = nullptr;
  }
}

void ReleaseAsyncResource() {
  if (!g_env) {
    return;
  }

  if (g_async_context) {
    napi_async_destroy(g_env, g_async_context);

    g_async_context = nullptr;
  }

  if (g_async_resource) {
    napi_delete_reference(g_env, g_async_resource);

    g_async_resource = nullptr;
  }
}

bool CreateAsyncResource(napi_env env) {
  napi_value resource = nullptr;
  napi_value resourceName = nullptr;

  if (napi_create_object(env, &resource) != napi_ok ||
      napi_create_string_utf8(env, "meru.swipeNavigation", NAPI_AUTO_LENGTH, &resourceName) !=
          napi_ok ||
      napi_async_init(env, resource, resourceName, &g_async_context) != napi_ok) {
    return false;
  }

  return napi_create_reference(env, resource, 1, &g_async_resource) == napi_ok;
}

bool ReadCallback(napi_env env, napi_value options, const char* name, napi_ref* out) {
  napi_value value = nullptr;

  if (napi_get_named_property(env, options, name, &value) != napi_ok) {
    return false;
  }

  napi_valuetype type = napi_undefined;
  napi_typeof(env, value, &type);

  if (type != napi_function) {
    return false;
  }

  return napi_create_reference(env, value, 1, out) == napi_ok;
}

void StopSwipeNavigation() {
  if (g_monitor) {
    [NSEvent removeMonitor:g_monitor];

    g_monitor = nil;
  }

  g_tracking = false;
  g_tracking_released = false;
  g_tracking_direction = nil;

  RemoveOverlay();
  ReleaseCallbacks();
  ReleaseAsyncResource();
}

void CleanUpEnvironment(void*) {
  g_cleanup_hook_added = false;

  StopSwipeNavigation();

  g_env = nullptr;
}

napi_value Start(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 1) {
    napi_throw_type_error(env, nullptr, "start expects an options object");

    return nullptr;
  }

  g_env = env;

  ReleaseCallbacks();
  ReleaseAsyncResource();

  if (!ReadCallback(env, argv[0], "onBegin", &g_on_begin) ||
      !ReadCallback(env, argv[0], "onEnd", &g_on_end)) {
    ReleaseCallbacks();

    napi_throw_type_error(env, nullptr, "start expects onBegin and onEnd functions");

    return nullptr;
  }

  ReadCallback(env, argv[0], "onProgress", &g_on_progress);

  if (!CreateAsyncResource(env)) {
    ReleaseCallbacks();
    ReleaseAsyncResource();

    napi_throw_error(env, nullptr, "start could not create its async resource");

    return nullptr;
  }

  g_tuning.arrivalProgress = ReadTuning(argv[0], "arrivalProgress", 0.3);
  g_tuning.completionAmount = ReadTuning(argv[0], "completionAmount", 0.99);
  g_tuning.horizontalDominanceRatio = ReadTuning(argv[0], "horizontalDominanceRatio", 1);
  g_tuning.minimumHorizontalDelta = ReadTuning(argv[0], "minimumHorizontalDelta", 3);
  g_tuning.maximumVerticalDelta = ReadTuning(argv[0], "maximumVerticalDelta", 20);
  g_tuning.overlayDiameter = ReadTuning(argv[0], "overlayDiameter", 44);
  g_tuning.overlayMaxOffset = ReadTuning(argv[0], "overlayMaxOffset", 40);
  g_tuning.overlayArrivingOpacity = ReadTuning(argv[0], "overlayArrivingOpacity", 0.5);
  g_tuning.overlayFadeInProgress = ReadTuning(argv[0], "overlayFadeInProgress", 0.15);
  g_tuning.overlayFadeOutDuration = ReadTuning(argv[0], "overlayFadeOutDuration", 150);

  if (!g_cleanup_hook_added &&
      napi_add_env_cleanup_hook(env, CleanUpEnvironment, nullptr) == napi_ok) {
    g_cleanup_hook_added = true;
  }

  if (!g_monitor) {
    g_monitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskScrollWheel
                                                     handler:^NSEvent*(NSEvent* event) {
                                                       if (!g_env) {
                                                         return event;
                                                       }

                                                       return HandleScrollWheel(event) ? nil
                                                                                       : event;
                                                     }];
  }

  return nullptr;
}

napi_value Stop(napi_env env, napi_callback_info info) {
  // Taken off here as well, so that the environment going away later cannot
  // remove a hook a second time.
  if (g_cleanup_hook_added) {
    napi_remove_env_cleanup_hook(env, CleanUpEnvironment, nullptr);

    g_cleanup_hook_added = false;
  }

  StopSwipeNavigation();

  return nullptr;
}

/**
 * Puts the bubble up at a fixed progress, with no gesture. The only way to see
 * it on a machine with no trackpad, and the only check that a window handle
 * from Electron and the one a scroll event carries name the same view.
 */
napi_value ShowOverlayForDebugging(napi_env env, napi_callback_info info) {
  size_t argc = 4;
  napi_value argv[4] = {nullptr, nullptr, nullptr, nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  napi_value result = nullptr;

  if (argc < 4) {
    napi_get_boolean(env, false, &result);

    return result;
  }

  g_env = env;

  void* handleData = nullptr;
  size_t handleLength = 0;
  napi_get_buffer_info(env, argv[0], &handleData, &handleLength);

  if (handleLength != sizeof(void*)) {
    napi_get_boolean(env, false, &result);

    return result;
  }

  void* handle = nullptr;
  memcpy(&handle, handleData, sizeof(handle));

  NSWindow* window = WindowForContentView(handle);

  if (!window) {
    napi_get_boolean(env, false, &result);

    return result;
  }

  double x = 0;
  double y = 0;
  double width = 0;
  double height = 0;
  ReadNumberProperty(argv[1], "x", &x);
  ReadNumberProperty(argv[1], "y", &y);
  ReadNumberProperty(argv[1], "width", &width);
  ReadNumberProperty(argv[1], "height", &height);

  char direction[8] = {};
  size_t directionLength = 0;
  napi_get_value_string_utf8(env, argv[2], direction, sizeof(direction), &directionLength);

  double progress = 0;
  napi_get_value_double(env, argv[3], &progress);

  ShowOverlay(window, NSMakeRect(x, y, width, height), strcmp(direction, "left") == 0, progress);

  napi_get_boolean(env, true, &result);

  return result;
}

napi_value HideOverlayForDebugging(napi_env env, napi_callback_info info) {
  RemoveOverlay();

  return nullptr;
}

napi_value Init(napi_env env, napi_value exports) {
  const napi_property_descriptor properties[] = {
      {"isSwipeTrackingEnabled", nullptr, IsSwipeTrackingEnabled, nullptr, nullptr, nullptr,
       napi_enumerable, nullptr},
      {"start", nullptr, Start, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
      {"stop", nullptr, Stop, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
      {"showOverlay", nullptr, ShowOverlayForDebugging, nullptr, nullptr, nullptr, napi_enumerable,
       nullptr},
      {"hideOverlay", nullptr, HideOverlayForDebugging, nullptr, nullptr, nullptr, napi_enumerable,
       nullptr},
  };

  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);

  return exports;
}

}  // namespace

NAPI_MODULE(swipe_navigation, Init)
