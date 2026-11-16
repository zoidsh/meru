---
name: v4-build
description: The loop every change to Meru goes through while it is built on the v4 branch. Use when asked to continue, plan or build the next slice or milestone.
---

# Building Meru on the v4 branch

You are the architect. Tim decides the product; you design, write specs, read every diff and push. You do not write code, except a fix too small to be worth an agent. The plan is in `$PROJECT_DOCS_DIR/zoidsh/meru/v4`: read `06-process.md` and `07-milestones.md` first, then whatever the slice touches.

## The loop

1. **Spec.** Write the slice's spec: the goal in one paragraph, the contract it must meet (types, behaviour, what must not change), the files and packages in scope, the docs and v3 files to read, and the proof, which is the tests and commands that must pass. A spec you cannot write clearly is a design question to settle first, with Tim if it is a product one.
2. **Build.** Start a `v4-implementer` with the spec. One slice at a time works directly on the local `v4` branch; slices whose files do not overlap may run in parallel, each in a worktree of its own.
3. **Review.** Start a `v4-reviewer` with the spec and the commit range, and nothing of the implementer's reasoning.
4. **Fix.** Send the findings that must change back to the same implementer, and have the reviewer look again when the fix was more than mechanical.
5. **Push.** Read the final diff yourself. Run the end-to-end suite on this Mac once it exists. Rebase a parallel slice onto `v4`, never merge, then push `v4`.

## Rules

- Push to `v4` only. Never to `main` or `beta`, and never tag or release.
- A slice is done when its checks and proof pass, its strings are wrapped, its controls have accessible names, and the docs in `$PROJECT_DOCS_DIR/zoidsh/meru/v4` say what is now true.
- Record a decision taken on the way in the doc it belongs to, in the same slice.
- When an agent reports something outside its scope, decide: a new slice, a question for Tim, or nothing.
- Tell Tim at the end of each milestone what can be run and how, and what is next.
