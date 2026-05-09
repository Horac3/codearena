// questions/coding/tests/coding-arrays-001.test.js
// The submitted function is injected as `solution` by the test harness.
// Do not import or reference the solution directly.

describe('twoSum', () => {
  test('basic case — first and second elements', () => {
    expect(solution([2, 7, 11, 15], 9)).toEqual([0, 1]);
  });

  test('target in the middle of the array', () => {
    expect(solution([3, 2, 4], 6)).toEqual([1, 2]);
  });

  test('duplicate values', () => {
    expect(solution([3, 3], 6)).toEqual([0, 1]);
  });

  test('negative numbers', () => {
    expect(solution([-3, 4, 3, 90], 0)).toEqual([0, 2]);
  });

  test('large array — must complete in O(n)', () => {
    const nums = Array.from({ length: 10000 }, (_, i) => i);
    const result = solution(nums, 19997);
    expect(result).toEqual([9998, 9999]);
  });
});
