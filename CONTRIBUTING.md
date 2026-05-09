# Contributing to CodeArena

Thank you for helping keep developers sharp. There are two ways to contribute:

1. **Questions** — the lifeblood of the platform
2. **Code** — features, bug fixes, infrastructure improvements

---

## Contributing Questions

### Question types

| Type | Description | File required |
|------|-------------|---------------|
| `mcq` | Multiple choice — 4 options, 1 correct | JSON |
| `trace` | Predict the output of a code snippet | JSON |
| `bug-hunt` | Spot the bug in a snippet | JSON |
| `coding` | Write a function, run against tests | JSON + Jest test file |

---

### MCQ / Trace / Bug-hunt

Add a `.json` file to the correct folder under `questions/`:

```
questions/
├── dsa/              # Arrays, trees, graphs, sorting, DP
├── systems/          # Caching, queues, databases, scaling
├── cs-fundamentals/  # Memory, OS, networking basics, compilers
└── networking/       # TCP/IP, HTTP, DNS, WebSockets
```

**Schema:**

```jsonc
{
  "id": "dsa-arrays-001",           // unique, kebab-case, topic-subtopic-NNN
  "type": "mcq",                    // mcq | trace | bug-hunt
  "topic": "dsa",                   // dsa | systems | cs-fundamentals | networking
  "difficulty": 2,                  // 1 = easy, 2 = medium, 3 = hard
  "stem": "What is the time complexity of binary search?",
  "code": null,                     // optional — include a code snippet if relevant
  "language": null,                 // required if code is present: "javascript" | "python" | "go" | "typescript"
  "options": [
    "O(n)",
    "O(log n)",
    "O(n log n)",
    "O(1)"
  ],
  "answer": 1,                      // 0-indexed into options
  "explanation": "Binary search halves the search space on each iteration, giving O(log n) time complexity.",
  "tags": ["arrays", "search", "complexity"],
  "author": "your-github-username"
}
```

**Rules:**
- `id` must be unique across the entire bank — check existing files before picking one
- `explanation` is mandatory — this is what the user learns from getting it wrong
- `difficulty` should reflect real-world developer knowledge: level 1 = junior, 2 = mid, 3 = senior
- No trick questions. The correct answer must be unambiguously correct.
- Keep `stem` under 200 characters. Use `code` for anything longer.

---

### Coding Challenges

Coding challenge PRs must include **three files**:

#### 1. Question definition — `questions/coding/<id>.json`

```jsonc
{
  "id": "coding-arrays-001",
  "type": "coding",
  "topic": "dsa",
  "difficulty": 2,
  "stem": "Given an array of integers, return the two numbers that add up to a target sum.",
  "functionSignature": {
    "javascript": "function twoSum(nums, target) {}",
    "python": "def two_sum(nums: list[int], target: int) -> list[int]:",
    "typescript": "function twoSum(nums: number[], target: number): number[] {}"
  },
  "constraints": [
    "2 <= nums.length <= 10^4",
    "Each input has exactly one solution",
    "You may not use the same element twice"
  ],
  "examples": [
    { "input": "nums = [2,7,11,15], target = 9", "output": "[0,1]" },
    { "input": "nums = [3,2,4], target = 6", "output": "[1,2]" }
  ],
  "tags": ["arrays", "hash-map"],
  "author": "your-github-username",
  "testFile": "coding-arrays-001.test.js"
}
```

#### 2. Test suite — `questions/coding/tests/<id>.test.js`

Write standard Jest tests. Your test file receives the user's submitted function as `solution`.
**Do not** import or reference the solution directly — the test runner injects it.

```javascript
// questions/coding/tests/coding-arrays-001.test.js
// The submitted function is available as: solution

describe('twoSum', () => {
  test('basic case', () => {
    expect(solution([2, 7, 11, 15], 9)).toEqual([0, 1]);
  });

  test('middle elements', () => {
    expect(solution([3, 2, 4], 6)).toEqual([1, 2]);
  });

  test('duplicate values', () => {
    expect(solution([3, 3], 6)).toEqual([0, 1]);
  });

  test('large array performance', () => {
    const nums = Array.from({ length: 10000 }, (_, i) => i);
    const result = solution(nums, 19999);
    expect(result).toEqual([9999, 10000] );
  });
});
```

#### 3. Reference solution — `questions/coding/solutions/<id>.js` (kept private)

```javascript
// questions/coding/solutions/coding-arrays-001.js
// This file is excluded from public forks via .gitignore.
// It is used only for CI validation of your test suite.
function twoSum(nums, target) {
  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) return [map.get(complement), i];
    map.set(nums[i], i);
  }
}
module.exports = twoSum;
```

**Rules for coding challenges:**
- Tests must cover: happy path, edge cases, and at least one performance test
- Minimum 4 test cases, maximum 20
- Time limit: 5 seconds per submission
- Your test suite is run against your reference solution in CI — the PR will fail if any tests fail against your own solution
- Tests should not be solvable by hardcoding expected outputs

---

## PR Checklist

Before opening a PR, confirm:

- [ ] `id` is unique (grep the questions folder)
- [ ] Schema validates (`npm run validate:questions` from repo root)
- [ ] `explanation` is clear and educational
- [ ] For coding challenges: tests pass against reference solution
- [ ] No duplicate questions (check similar topics first)
- [ ] `author` field has your GitHub username

---

## Code Contributions

Standard flow: fork → branch → PR. Please open an issue first for anything beyond a small bug fix, so we can discuss approach before you invest time.

Run `npm test` before submitting. CI must pass.
