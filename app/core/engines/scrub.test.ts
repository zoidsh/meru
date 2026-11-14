import { describe, expect, it } from "vitest";

import { scrubHtml } from "./scrub.ts";

describe(scrubHtml, () => {
  it("replaces an email address in text, in an attribute, in a mailto link and in a label", () => {
    expect(
      scrubHtml(
        '<div aria-label="Mail from jane.doe+tag@example.co.uk" data-hovercard-id="jane.doe+tag@example.co.uk" title="jane.doe+tag@example.co.uk"><a href="mailto:jane.doe+tag@example.co.uk">jane.doe+tag@example.co.uk</a></div>'
      )
    ).toBe(
      '<div aria-label="Mail from person@example.com" data-hovercard-id="person@example.com" title="person@example.com"><a href="mailto:person@example.com">person@example.com</a></div>'
    );
  });

  it("replaces a sender's name, as the text of the element carrying the address and as its name attribute", () => {
    expect(
      scrubHtml('<span email="tom@example.com" name="Tom O\'Brien">Tom</span>')
    ).toBe('<span email="person@example.com" name="Sender">Sender</span>');
  });

  it("replaces a name beside a hovercard id and leaves a form field's name, which a fixture is selected by", () => {
    expect(
      scrubHtml(
        '<span data-hovercard-id="tom@example.com" name="Tom">Tom</span><input name="to"><input name="subjectbox">'
      )
    ).toBe(
      '<span data-hovercard-id="person@example.com" name="Sender">Tom</span><input name="to"><input name="subjectbox">'
    );
  });

  it("replaces a subject and a snippet of the list by their classes, through the spans nested in them", () => {
    expect(
      scrubHtml(
        '<span class="bog"><span>Quarterly numbers</span></span><span class="y2"> - Here are the numbers you asked for</span><span class="bqe">Another subject</span>'
      )
    ).toBe(
      '<span class="bog"><span>Subject</span></span><span class="y2">Snippet</span><span class="bqe">Subject</span>'
    );
  });

  it("replaces a thread's subject heading, keeping the attribute's name", () => {
    expect(
      scrubHtml('<h2 data-legacy-thread-id="FMfcgzQbXyZ123456789">Lunch?</h2>')
    ).toBe('<h2 data-legacy-thread-id="thread-1">Subject</h2>');
  });

  it("replaces the document's title, which carries the subject and the address", () => {
    expect(
      scrubHtml("<title>Inbox (3) - jane@example.com - Gmail</title>")
    ).toBe("<title>Subject</title>");
  });

  it("gives equal ids one placeholder and unequal ids another, across attributes and the address's fragment", () => {
    expect(
      scrubHtml(
        '<a href="#inbox/FMfcgzQbXyZ123456789"></a><div data-legacy-thread-id="FMfcgzQbXyZ123456789" data-thread-id="thread-f:1790000000000000001"><div data-legacy-message-id="18c1a2b3c4d5e6f7" data-legacy-last-message-id="18c1a2b3c4d5e6f7"></div></div>'
      )
    ).toBe(
      '<a href="#inbox/thread-1"></a><div data-legacy-thread-id="thread-1" data-thread-id="thread-2"><div data-legacy-message-id="message-1" data-legacy-last-message-id="message-1"></div></div>'
    );
  });

  it("numbers the ids of a second call afresh, holding no state between calls", () => {
    const html = '<div data-thread-id="thread-f:1790000000000000009"></div>';
    expect(scrubHtml(html)).toBe(scrubHtml(html));
    expect(scrubHtml(html)).toBe('<div data-thread-id="thread-1"></div>');
  });

  it("replaces an id in a label's and a starred fragment, by the view it sits under", () => {
    expect(
      scrubHtml(
        '<a href="#label/Work/FMfcgzQbXyZ123456789"></a><a href="#all/QgrcJHsBmTZtXpWjLkQ"></a>'
      )
    ).toBe('<a href="#label/Work/thread-1"></a><a href="#all/thread-2"></a>');
  });

  it("drops every script's contents and keeps its tags", () => {
    expect(
      scrubHtml(
        '<script nonce="r4nd0m">var GM_ID_KEY = "secret";</script><script type="text/javascript">window.GLOBALS=[1,"at-token"];</script>'
      )
    ).toBe(
      '<script nonce=""></script><script type="text/javascript"></script>'
    );
  });

  it("drops a query string from an absolute and a relative address, and a bare session token", () => {
    expect(
      scrubHtml(
        '<a href="https://mail.google.com/mail/u/0?ik=abc123&at=AF6bupN#inbox">x</a><a href="/mail/u/0/?compose=new">y</a><a href="https://mail.google.com/mail/u/0/h/?at=AF6bupN">z</a>'
      )
    ).toBe(
      '<a href="https://mail.google.com/mail/u/0?[scrubbed]#inbox">x</a><a href="/mail/u/0/?[scrubbed]">y</a><a href="https://mail.google.com/mail/u/0/h/?[scrubbed]">z</a>'
    );
  });

  it("replaces an inline data URL, an avatar's among them", () => {
    expect(
      scrubHtml(
        '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="><div style="background-image:url(data:image/gif;base64,R0lGOD)"></div>'
      )
    ).toBe(
      '<img src="data:,"><div style="background-image:url(data:,)"></div>'
    );
  });

  it("empties a nonce and keeps the attribute", () => {
    expect(scrubHtml('<style nonce="r4nd0m-value"></style>')).toBe(
      '<style nonce=""></style>'
    );
  });

  it("keeps the markup a fixture's selectors read: tags, roles, aria, tooltips, classes, icon paths and a bare fragment", () => {
    const html =
      '<div class="AO" role="main"><table role="grid"><tr class="zA zE" role="row"><td><div aria-label="Archive" data-tooltip="Archive" role="button"><svg><path d="M6 4h12v2H6z"></path></svg></div></td></tr></table><a href="#inbox" role="link">Inbox</a></div>';
    expect(scrubHtml(html)).toBe(html);
  });
});
