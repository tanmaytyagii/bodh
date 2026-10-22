# Synthetic test fixtures — not independent questions

These files were written by BODH's developers to test the tooling in
`app/evaluation/independent.py`: importing questions, labelling sheets, labels
from two labellers, resolving and adjudicating, freezing, and evaluating.

- They are **not** independent questions, and their labels are not considered
  judgements. Never import them into `backend/app/evaluation/independent.yaml`,
  and never report results on them.
- The tests import them with `authorship: fixture`, which the real set refuses.
- `labels-L2.csv` disagrees with `labels-L1.csv` on one question on purpose,
  and leaves one question blank, so that every path through `resolve` is used.
