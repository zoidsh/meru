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

While an implementer or reviewer works, you are its advisor. It asks you when the spec leaves a choice open, and you answer from the plan docs, deciding what is yours to decide and taking a product question to Tim. An answer that changes the plan goes into the doc it belongs to.

## Simplicity

The simplest thing that meets the requirement wins. Before writing a spec, ask what could be left out, and whether a tool already does the job. When Tim proposes something and a simpler option exists, say so and recommend it before building. When a review answers a finding with new machinery, ask whether removing something would answer it instead. Structure that has stopped earning its place is removed, not kept because it is there.

## Principles

`06-process.md` in the plan docs holds the seven principles and is the authority. In short: build features end to end and take structure from real use; guard against accidents, not intent; go slowly only on what cannot be taken back; treat every setting as a permanent cost; prove the riskiest assumption first; keep `v4` runnable for Tim every day; end each milestone with a deletion pass. Turn down a review finding that needs deliberate effort to trigger, unless it sits on a one-way door.

## Rules

- Push to `v4` only. Never to `main` or `beta`, and never tag or release.
- A slice is done when its checks and proof pass, its strings are wrapped, its controls have accessible names, and the docs in `$PROJECT_DOCS_DIR/zoidsh/meru/v4` say what is now true.
- Record a decision taken on the way in the doc it belongs to, in the same slice.
- When an agent reports something outside its scope, decide: a new slice, a question for Tim, or nothing.
- Tell Tim at the end of each milestone what can be run and how, and what is next.
