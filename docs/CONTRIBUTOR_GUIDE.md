# CodeArena — Contributor Guide

Thank you for contributing. This guide covers everything you need to know
to add questions, submit code contributions, and become a community reviewer.

---

## Table of Contents

1. [Two Types of Contribution](#1-two-types-of-contribution)
2. [Contributing Questions](#2-contributing-questions)
3. [Question Schema Reference](#3-question-schema-reference)
4. [Coding Challenges](#4-coding-challenges)
5. [Code Contributions](#5-code-contributions)
6. [Becoming a Community Reviewer](#6-becoming-a-community-reviewer)
7. [The Review Process](#7-the-review-process)
8. [Rewards](#8-rewards)
9. [PR Checklist](#9-pr-checklist)

---

## 1. Two Types of Contribution

**Questions** — the content that developers answer. Higher bar because
bad questions affect competitive integrity (rank points). Goes through
structured human review before going live.

**Code** — features, bug fixes, infrastructure. Standard open source
fork → PR → CI → review → merge flow.

---

## 2. Contributing Questions

### Step 1 — Pick a topic and type

| Folder | Topic |
|---|---|
| `questions/dsa/` | Arrays, trees, graphs, sorting, DP, complexity |
| `questions/systems/` | Caching, queues, databases, scaling, CAP theorem |
| `questions/cs-fundamentals/` | Memory, OS, concurrency, SOLID, HTTP status codes |
| `questions/networking/` | TCP/IP, DNS, HTTP, WebSockets, TLS |
| `questions/coding/` | Coding challenges (write a function) |

| Type | What it tests |
|---|---|
| `mcq` | Knowledge — 4 options, 1 correct |
| `trace` | Code reading — predict the output |
| `bug-hunt` | Code review — identify the bug |
| `coding` | Implementation — write a working function |

### Step 2 — Check for duplicates

```bash
# Search existing IDs before picking yours
grep -r '"id"' questions/ | grep -v solutions | grep -v tests
```

IDs follow the pattern `topic-subtopic-NNN` e.g. `dsa-arrays-007`.

### Step 3 — Create your question file

For MCQ, trace, and bug-hunt, add your question to the relevant JSON array
or create a new `.json` file. For coding challenges, see section 4.

### Step 4 — Validate locally

```bash
npm install
npx ts-node \
  --project packages/question-schema/tsconfig.json \
  packages/question-schema/src/validate-cli.ts \
  questions/
```

### Step 5 — Open a PR

Title format: `feat(questions): add <topic> <type> question — <id>`

Example: `feat(questions): add dsa mcq question — dsa-graphs-003`

CI will automatically:
- Validate the schema
- Check for duplicate IDs
- Run reference solutions against test suites (coding challenges)
- Label the PR and notify reviewers

---

## 3. Question Schema Reference

### MCQ / Trace / Bug-hunt

```jsonc
{
  "id": "dsa-arrays-007",          // unique, kebab-case
  "type": "mcq",                   // mcq | trace | bug-hunt
  "topic": "dsa",                  // dsa | systems | cs-fundamentals | networking
  "difficulty": 2,                 // 1=easy 2=medium 3=hard
  "stem": "What is...",            // the question text (max 200 chars)
  "code": "function foo() {...}",  // optional code snippet
  "language": "javascript",        // required if code is present
  "options": [                     // exactly 4 strings
    "Option A",
    "Option B",
    "Option C",
    "Option D"
  ],
  "answer": 1,                     // 0-indexed — which option is correct
  "explanation": "...",            // shown after answering — must teach something
  "tags": ["arrays", "search"],
  "author": "your-github-username"
}
```

**Rules:**
- `explanation` must explain WHY, not just restate the answer
- `difficulty` 1 = junior developer knows it, 2 = mid-level, 3 = senior
- All 4 options must be plausible — no obviously wrong distractors
- Questions must have an unambiguously correct answer
- No trick questions

**Bug-hunt only — include `fixedCode`:**
```jsonc
{
  "fixedCode": "function foo() { /* corrected version */ }"
}
```

### Difficulty Calibration Guide

| Difficulty | Benchmark |
|---|---|
| 1 (easy) | A developer with 6 months experience would know this |
| 2 (medium) | A developer with 2 years experience would know this |
| 3 (hard) | Requires deep knowledge of the topic or non-obvious insight |

---

## 4. Coding Challenges

Coding challenges require **three files**:

### File 1 — Question definition
`questions/coding/coding-<topic>-NNN.json`

```jsonc
{
  "id": "coding-arrays-007",
  "type": "coding",
  "topic": "dsa",
  "difficulty": 2,
  "stem": "Given an array of integers, return...",
  "functionSignature": {
    "javascript": "function solve(nums) {}",
    "typescript": "function solve(nums: number[]): number[] {}",
    "python": "def solve(nums: list[int]) -> list[int]:\n    pass"
  },
  "constraints": [
    "1 <= nums.length <= 10^4"
  ],
  "examples": [
    { "input": "nums = [1,2,3]", "output": "[3,2,1]" }
  ],
  "explanation": "...",
  "tags": ["arrays"],
  "testFile": "coding-arrays-007.test.js",
  "timeLimit": 5000,
  "author": "your-github-username"
}
```

### File 2 — Test suite (public)
`questions/coding/tests/coding-arrays-007.test.js`

The test harness injects `solution` as the submitted function.
Do not import anything — no Jest, no Node modules.
Use only the inline harness functions: `test()`, `describe()`, `expect()`.

```javascript
// The submitted function is available as: solution

describe('solve', () => {
  test('basic case', () => {
    expect(solution([1, 2, 3])).toEqual([3, 2, 1]);
  });

  test('single element', () => {
    expect(solution([42])).toEqual([42]);
  });

  test('empty array', () => {
    expect(solution([])).toEqual([]);
  });

  test('performance — large array', () => {
    const large = Array.from({ length: 10000 }, (_, i) => i);
    const result = solution([...large]);
    expect(result[0]).toBe(9999);
  });
});
```

**Test requirements:**
- Minimum 4 test cases, maximum 20
- Must include: happy path, edge cases, at least one performance test
- Do NOT hardcode expected outputs that could be gamed
- Tests must be deterministic (no randomness)

### File 3 — Reference solution (gitignored)
`questions/coding/solutions/coding-arrays-007.js`

```javascript
// Reference solution — private, used only by CI to validate your tests
function solution(nums) {
  return nums.reverse();
}
module.exports = solution;
```

The `solutions/` directory is in `.gitignore` and is never published.
CI uses it to confirm your tests pass against a correct implementation.

---

## 5. Code Contributions

Standard open source workflow:

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/YOUR_FORK/codearena.git
cd codearena
git checkout -b feat/your-feature-name

# Make changes
npm install
npm run dev:api   # test locally

# Commit
git commit -m "feat: add weekly competition reminder notification"
git push origin feat/your-feature-name
# Open a PR on GitHub
```

**Commit message format** (Conventional Commits):
```
feat:     new feature
fix:      bug fix
docs:     documentation only
refactor: code change without feature/fix
test:     adding tests
chore:    tooling, deps, CI
```

**PR requirements:**
- CI must pass
- At least one maintainer approval
- No unresolved review comments

For anything beyond a small bug fix, open an issue first to discuss approach.

---

## 6. Becoming a Community Reviewer

Reviewers are trusted developers who evaluate question contributions.
They earn rank points for every review.

### Eligibility

- Must be **rank tier 5+** (Algorithm Apprentice — ~4,500 rank points)
- Founding reviewers (first 3 months of platform): rank tier 3+ accepted

### The Shadow Review Process

1. Find a contribution in `NEEDS_REVIEW` status via the API or GitHub
2. Submit a **shadow review** via `POST /contributions/:id/shadow-review`
   (your verdict is hidden until a maintainer reviews the same contribution)
3. Complete 3 shadow reviews
4. A maintainer compares your verdicts to theirs
5. If your accuracy is ≥ 90% → you are promoted to **ACTIVE reviewer**

### What you're checking

The review checklist has 6 items. All must be evaluated:

| Item | Question to ask |
|---|---|
| `stemClear` | Is the question clear and unambiguous? |
| `correctAnswer` | Is the stated correct answer unambiguously correct? |
| `distractors` | Are the wrong answers plausible but clearly wrong? |
| `explanation` | Does the explanation teach something, not just state the answer? |
| `testCoverage` | (coding only) Do tests cover happy path, edges, and performance? |
| `difficultyAccurate` | Does the difficulty rating match the question's actual difficulty? |

### Reviewer levels

| Level | Requirement | Permissions |
|---|---|---|
| SHADOW | Rank 5+, in probation | Can submit shadow reviews |
| ACTIVE | 3 shadows, 90% accuracy | Can officially approve/reject PRs |
| SENIOR | Rank 8+ + ACTIVE | Can merge contributions without maintainer sign-off |

### Reviewer conduct

- Leave specific, constructive feedback — tell the author how to improve
- If rejecting: explain exactly what needs to change
- If approving with concerns: note them as suggestions, not blockers
- Do not approve questions you authored

---

## 7. The Review Process

From the contributor's perspective:

```
You open a PR
  ↓
CI runs (2–5 minutes):
  - Schema validation
  - Duplicate ID check
  - Solution tests (coding challenges)
  ↓
CI passes → PR enters review queue
  ↓
Two reviewers (rank 5+) are auto-assigned
They have 72 hours to review
  ↓
Both approve → status: APPROVED
  ↓
Maintainer merges → your question is live
You receive notification + rank points
```

If reviewers request changes:
1. Update your PR based on their feedback
2. Comment `@codearena-bot re-review` (if bot is configured) or tag a reviewer
3. Process repeats from the review step

---

## 8. Rewards

| Action | Rank Points |
|---|---|
| Question merged | +200 pts |
| Question used in Daily Blitz | +100 pts bonus |
| Question used in Weekly Competition | +300 pts bonus |
| Review submitted | +10 pts |
| Review leads to merge | +50 pts |

**Badges:**

| Badge | Trigger |
|---|---|
| Question Author | First question merged |
| Content Creator | 5 questions merged |
| Curriculum Architect | 20 questions merged |
| Community Reviewer | Promoted to ACTIVE reviewer |
| Founding Reviewer | Pre-launch reviewer (permanent) |

The "question used in Daily Blitz" bonus triggers automatically when
your question appears in the daily set. You'll receive an in-app
notification showing how many developers answered your question that day.

---

## 9. PR Checklist

Before opening a PR, confirm:

- [ ] `id` is unique — checked with `grep -r '"id"' questions/`
- [ ] Schema validates — `npx ts-node .../validate-cli.ts questions/`
- [ ] `explanation` is educational, not just the answer restated
- [ ] `difficulty` rating is accurate per the calibration guide
- [ ] `author` field contains your GitHub username
- [ ] (coding) Tests pass against reference solution: `node .github/scripts/test-solutions.js`
- [ ] (coding) Test suite covers happy path, edge cases, and performance
- [ ] (coding) Reference solution is in `questions/coding/solutions/` (gitignored)
- [ ] No duplicate IDs anywhere in the bank
- [ ] CI passes on the PR
