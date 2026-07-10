# Coding 프롬프트 필수 영어 단어장

코딩 에이전트에게 지시할 때 자주 쓰는 영어 단어를 카테고리별로 정리한 목록.
예문은 그대로 프롬프트에 응용할 수 있는 형태로 작성.

---

## 1. 작업 지시 동사 (가장 많이 씀)

| 단어 | 뜻 | 예문 |
|---|---|---|
| implement | 구현하다 | Implement a login function. |
| create / make | 만들다 | Create a new config file. |
| add | 추가하다 | Add error handling to this function. |
| fix | 고치다 | Fix the bug in the payment logic. |
| refactor | (동작 유지한 채) 구조 개선하다 | Refactor this function to reduce nesting. |
| update | 갱신하다, 수정하다 | Update the dependencies to the latest version. |
| remove / delete | 제거하다 | Remove the unused imports. |
| rename | 이름을 바꾸다 | Rename `getData` to `fetchUserData`. |
| replace | 교체하다 | Replace the for-loop with `map()`. |
| rewrite | 다시 작성하다 | Rewrite this in TypeScript. |
| extract | 추출하다, 분리해내다 | Extract this logic into a separate function. |
| split | 나누다 | Split this file into smaller modules. |
| merge | 합치다 | Merge these two functions into one. |
| move | 옮기다 | Move the constants to a config file. |
| generate | 생성하다 | Generate test data for this schema. |
| convert | 변환하다 | Convert this callback to async/await. |
| simplify | 단순화하다 | Simplify this conditional logic. |
| optimize | 최적화하다 | Optimize this query for large datasets. |
| clean up | 정리하다 | Clean up the dead code. |
| revert | 되돌리다 | Revert the last change. |

## 2. 분석 · 설명 요청

| 단어 | 뜻 | 예문 |
|---|---|---|
| explain | 설명하다 | Explain how this middleware works. |
| analyze | 분석하다 | Analyze the performance bottleneck. |
| review | 검토하다 | Review this code for potential bugs. |
| check | 확인하다 | Check if the tests still pass. |
| verify | 검증하다 | Verify that the fix works end-to-end. |
| investigate | 조사하다 | Investigate why the build fails. |
| find | 찾다 | Find all usages of this function. |
| identify | 식별하다, 짚어내다 | Identify the root cause of the crash. |
| compare | 비교하다 | Compare these two approaches. |
| summarize | 요약하다 | Summarize the changes in this branch. |
| suggest / recommend | 제안하다 / 추천하다 | Suggest a better naming convention. |
| trace | (실행 흐름을) 추적하다 | Trace the request flow from the router to the DB. |

## 3. 디버깅 · 문제 표현

| 단어 | 뜻 | 예문 |
|---|---|---|
| bug | 버그 | There is a bug in the date parsing. |
| error | 오류 | I get an error when I run the build. |
| crash | (프로그램) 죽음, 강제 종료 | The app crashes on startup. |
| fail | 실패하다 | Two tests fail after the change. |
| throw | (예외를) 던지다 | This function throws when the input is null. |
| broken | 망가진, 동작 안 하는 | The pagination is broken. |
| unexpected | 예상 밖의 | The API returns an unexpected result. |
| reproduce | (문제를) 재현하다 | I can reproduce the issue with this input. |
| intermittent | 간헐적인 | This is an intermittent failure, not consistent. |
| regression | (이전엔 되던 게) 다시 깨짐 | This looks like a regression from last week's commit. |
| edge case | 경계 상황, 특수 케이스 | Handle the edge case where the list is empty. |
| race condition | 경쟁 조건 (동시성 버그) | There might be a race condition between the two writes. |
| root cause | 근본 원인 | Find the root cause instead of patching the symptom. |
| workaround | 임시 우회책 | This is a workaround, not a proper fix. |
| typo | 오타 | It was just a typo in the variable name. |

## 4. 코드 구조 · 품질

| 단어 | 뜻 | 예문 |
|---|---|---|
| function | 함수 | Split this function into two. |
| variable | 변수 | Use a more descriptive variable name. |
| dependency | 의존성 | Avoid adding a new dependency. |
| duplicate / duplicated | 중복(된) | Remove the duplicated logic. |
| nested | 중첩된 | This code has too many nested ifs. |
| readable / readability | 읽기 쉬운 / 가독성 | Improve the readability of this block. |
| maintainable | 유지보수하기 좋은 | Make this more maintainable. |
| reusable | 재사용 가능한 | Turn this into a reusable component. |
| consistent | 일관된 | Keep the naming consistent with the rest of the codebase. |
| hardcoded | 하드코딩된 | Move the hardcoded URL to an env variable. |
| deprecated | 사용 중단 예정인 | Replace the deprecated API. |
| boilerplate | 반복적으로 쓰는 상용구 코드 | Reduce the boilerplate in the handlers. |
| abstraction | 추상화 | This abstraction feels unnecessary. |
| coupling | 결합도 | Reduce the coupling between these modules. |
| side effect | 부수 효과 | This function has a hidden side effect. |

## 5. 조건 · 제약 표현 (프롬프트 정밀도를 높여줌)

| 단어 | 뜻 | 예문 |
|---|---|---|
| only | ~만 | Only change the CSS, not the markup. |
| without | ~없이 | Fix it without adding new dependencies. |
| instead of | ~대신에 | Use composition instead of inheritance. |
| unless | ~하지 않는 한 | Don't touch the tests unless necessary. |
| at least / at most | 최소한 / 최대한 | Keep the function at most 30 lines. |
| existing | 기존의 | Follow the existing code style. |
| minimal | 최소한의 | Make a minimal change to fix this. |
| backward compatible | 하위 호환되는 | The change must be backward compatible. |
| preserve / keep | 유지하다 | Preserve the current behavior. |
| ensure / make sure | 반드시 ~하게 하다 | Make sure all tests pass. |
| avoid | 피하다 | Avoid global variables. |
| ignore | 무시하다 | Ignore the lint warnings for now. |
| optional | 선택적인 | Make the second parameter optional. |
| required | 필수인 | The API key is required. |
| by default | 기본값으로 | Enable caching by default. |

## 6. 동작 · 흐름 설명

| 단어 | 뜻 | 예문 |
|---|---|---|
| when / whenever | ~할 때 / ~할 때마다 | Whenever the user clicks the button, generate numbers. |
| on click / on submit | 클릭 시 / 제출 시 | Show a spinner on submit. |
| trigger | (동작을) 유발하다 | Saving the file triggers a rebuild. |
| display / show | 표시하다 | Display the previous results as a list. |
| hide | 숨기다 | Hide the button while loading. |
| append | 뒤에 덧붙이다 | Append each new result to the history list. |
| store / save | 저장하다 | Store the results in localStorage. |
| load / fetch | 불러오다 / 가져오다 | Fetch the user data from the API. |
| return | 반환하다 | The function should return null on failure. |
| pass | (값을) 전달하다 | Pass the ID as a parameter. |
| handle | 처리하다 | Handle the case where the response is empty. |
| validate | 유효성을 검사하다 | Validate the input before saving. |
| retry | 재시도하다 | Retry the request up to 3 times. |
| timeout | 시간 초과 | Add a 10-second timeout to the request. |
| fallback | 대체 동작 | Use a fallback value if the config is missing. |

## 7. 정도 · 뉘앙스 표현

| 단어 | 뜻 | 예문 |
|---|---|---|
| probably / likely | 아마도 | The cache is likely the problem. |
| seems / looks like | ~인 것 같다 | It seems like a timing issue. |
| slightly | 약간 | Make the delay slightly longer. |
| significantly | 상당히 | This is significantly slower than before. |
| properly | 제대로 | The error isn't handled properly. |
| gracefully | 우아하게 (오류 시 안전하게) | Fail gracefully when the server is down. |
| explicitly | 명시적으로 | Set the type explicitly. |
| roughly | 대략 | It takes roughly 3 seconds. |
| for now | 일단은, 당분간 | Skip the tests for now. |
| eventually | 결국에는, 나중에 | We should eventually migrate to v2. |

## 8. 자주 틀리기 쉬운 표현 교정

| 흔한 실수 | 올바른 표현 | 메모 |
|---|---|---|
| it have | it **has** | 3인칭 단수 |
| informations | **information** | 불가산 명사 (datas → data도 주의) |
| codes | **code** | "코드"는 보통 불가산: fix this code |
| in the function | **in** vs **inside** | 둘 다 가능하지만 in이 일반적 |
| depend of | depend **on** | 전치사 주의 |
| explain me | explain **to me** (또는 그냥 explain) | explain은 4형식 불가 |
| make it more better | make it **better** | more + 비교급 중복 금지 |
| please kindly | **please** 하나만 | 중복 공손 표현 |
| until now it works | **so far** it works | "지금까지"는 so far |
| I want that you fix | I want **you to fix** | want + 목적어 + to부정사 |

---

**활용 팁:** `/eb mistakes`로 자신이 실제 자주 틀리는 패턴을 확인하고, 이 목록의 5번(조건·제약)을 프롬프트에 섞으면 에이전트 결과 정밀도가 눈에 띄게 좋아집니다.
