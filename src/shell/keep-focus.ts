/** A press that leaves focus where it was, for a control hidden from assistive technology. */
export const keepFocus = (event: { preventDefault: () => void }) => {
  event.preventDefault();
};
