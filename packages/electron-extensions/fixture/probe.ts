/**
 * The one probe entry point, run as the fixture's content script and by both
 * of its pages. It runs the probe suite and writes the results where the
 * end-to-end tests read them: a `data-` attribute on the document element,
 * which a content script's isolated world and the page's main world share,
 * and which no page Content-Security-Policy has any say over — a `<script>`
 * results block would invite exactly the CSP question one of the probes is
 * asking.
 */
import { runProbes } from "./probes";

type FixtureDocument = {
  documentElement: {
    setAttribute: (name: string, value: string) => void;
  };
};

const RESULTS_ATTRIBUTE = "data-meru-fixture-results";

const { document } = globalThis as unknown as { document: FixtureDocument };

runProbes().then((results) => {
  document.documentElement.setAttribute(RESULTS_ATTRIBUTE, JSON.stringify(results));
});
