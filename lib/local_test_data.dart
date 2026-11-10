import 'missions/quiz/content.dart';

// 명시적으로 켠 로컬 테스트에서만 사용합니다. 실제 학생 데이터가 아닙니다.
const localTestMode = bool.fromEnvironment(
  'LOCAL_TEST_MODE',
  defaultValue: false,
);
const localTestStorageKey = 'growgame.local-test.v1';
const localTestProfile = {'grade': 1, 'classNo': 1, 'number': 1};
const localTestSpecial = {
  'title': '특별 미션 테스트',
  'description': '완료 표시를 선택하고 성장 보상을 확인해 보세요.',
};
const localTestQuiz = [
  QuizQuestion(
    question: '물 주기를 한 번 하면 얼마나 성장할까요?',
    choices: ['10%', '20%', '30%', '50%'],
    correctIndex: 3,
    explanation: '물 주기는 한 번에 50% 성장합니다.',
  ),
];
