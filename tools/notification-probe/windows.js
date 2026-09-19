const path = require("node:path");

const RESOURCES = process.resourcesPath;
const CHIRP = path.join(RESOURCES, "chirp.wav");

/*
 * Windows PowerShell 5.1 projects WinRT types; PowerShell 7 dropped that, so
 * these must run through powershell.exe rather than pwsh. It is what lets the
 * probe answer the FocusSessionManager question without a native addon first.
 */
function powershell(script) {
  return ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script];
}

const FOCUS_SESSION_SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
  [void][Windows.UI.Shell.FocusSessionManager, Windows.UI.Shell, ContentType = WindowsRuntime]
  $supported = [Windows.UI.Shell.FocusSessionManager]::IsSupported
  if (-not $supported) { "IsSupported=False"; exit }
  $manager = [Windows.UI.Shell.FocusSessionManager]::GetDefault()
  "IsSupported=True IsFocusActive=$($manager.IsFocusActive)"
} catch { "ERR $($_.Exception.Message)" }
`;

const QUNS_SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
  Add-Type -Namespace Probe -Name Shell -MemberDefinition @'
[DllImport("shell32.dll")]
public static extern int SHQueryUserNotificationState(out int state);
'@
  $state = 0
  $hr = [Probe.Shell]::SHQueryUserNotificationState([ref]$state)
  $names = @{ 1 = 'NOT_PRESENT'; 2 = 'BUSY'; 3 = 'RUNNING_D3D_FULL_SCREEN'; 4 = 'PRESENTATION_MODE'; 5 = 'ACCEPTS_NOTIFICATIONS'; 6 = 'QUIET_TIME'; 7 = 'APP' }
  "$state QUNS_$($names[$state]) (hr=$hr)"
} catch { "ERR $($_.Exception.Message)" }
`;

const QUIET_HOURS_KEY = String.raw`HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\CloudStore\Store\DefaultAccount\Current\$$windows.data.notifications.quiethoursstate\Current`;

function toast(audio) {
  return `<toast><visual><binding template="ToastGeneric"><text>Meru notification probe</text><text>probe</text></binding></visual>${audio}</toast>`;
}

module.exports = {
  title: "Windows notification sound probe",
  unattended: true,
  sounds: "chirp / windows default / other",

  phases: {
    off: "Nothing on: no Do Not Disturb, no focus session",
    dnd: "Do not disturb toggled on by hand",
    session: "A focus session started from the Clock app",
    priority: "Do not disturb on, Meru Probe added to priority notifications",
  },

  osVersion: (run) => run("cmd", ["/c", "ver"]),

  signing: (run) =>
    run(
      "powershell.exe",
      powershell(
        `(Get-AuthenticodeSignature '${process.execPath}' | Select-Object -ExpandProperty Status)`,
      ),
    ),

  async signals(run) {
    const [focusSession, quns, quietHours, toastsEnabled] = await Promise.all([
      run("powershell.exe", powershell(FOCUS_SESSION_SCRIPT)),
      run("powershell.exe", powershell(QUNS_SCRIPT)),
      run("reg", ["query", QUIET_HOURS_KEY, "/v", "Data"]),
      run("reg", [
        "query",
        String.raw`HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings`,
        "/v",
        "NOC_GLOBAL_SETTING_TOASTS_ENABLED",
      ]),
    ]);

    return [
      ["FocusSessionManager", focusSession],
      ["SHQueryUserNotificationState", quns],
      ["quiethoursstate Data", quietHours.replace(/\s+/g, " ").slice(0, 160)],
      ["NOC_GLOBAL_SETTING_TOASTS_ENABLED", toastsEnabled.replace(/\s+/g, " ").slice(0, 160)],
    ];
  },

  cases: [
    { label: "no silent, no toastXml", options: {} },
    { label: "silent: true  (what Meru ships today)", options: { silent: true } },
    {
      label: "toastXml audio ms-winsoundevent:Notification.IM  (what Signal ships)",
      options: { toastXml: toast('<audio src="ms-winsoundevent:Notification.IM" />') },
    },
    {
      label: "toastXml audio ms-winsoundevent:Notification.Mail",
      options: { toastXml: toast('<audio src="ms-winsoundevent:Notification.Mail" />') },
    },
    {
      label: "toastXml audio file:/// absolute path to chirp.wav",
      options: { toastXml: toast(`<audio src="file:///${CHIRP.replace(/\\/g, "/")}" />`) },
    },
    {
      label: "toastXml audio bare absolute path to chirp.wav",
      options: { toastXml: toast(`<audio src="${CHIRP.replace(/\\/g, "/")}" />`) },
    },
    {
      label: "toastXml audio ms-appdata:///local/chirp.wav",
      options: { toastXml: toast('<audio src="ms-appdata:///local/chirp.wav" />') },
    },
    {
      label: "toastXml audio ms-appx:///chirp.wav",
      options: { toastXml: toast('<audio src="ms-appx:///chirp.wav" />') },
    },
    {
      label: 'toastXml audio silent="true"',
      options: { toastXml: toast('<audio silent="true" />') },
    },
  ],
};
