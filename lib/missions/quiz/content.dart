class QuizQuestion {
  const QuizQuestion({
    required this.question,
    required this.choices,
    this.correctIndex,
    this.id,
    this.explanation = '',
  });
  final String question;
  final List<String> choices;
  final int? correctIndex;
  final int? id;
  final String explanation;

  bool get isValid =>
      question.trim().isNotEmpty &&
      choices.length == 4 &&
      choices.every((c) => c.trim().isNotEmpty) &&
      (correctIndex == null
          ? id != null
          : correctIndex! >= 0 && correctIndex! < 4);
}

List<QuizQuestion> parseQuizQuestions(dynamic raw) {
  if (raw is! List || raw.length > 20) throw const FormatException('퀴즈 형식 오류');
  return raw.map((item) {
    if (item is! Map ||
        item['id'] is! int ||
        item['question'] is! String ||
        item['choices'] is! List ||
        !(item['choices'] as List).every((c) => c is String) ||
        (item['correctIndex'] != null && item['correctIndex'] is! int) ||
        (item['explanation'] != null && item['explanation'] is! String))
      throw const FormatException('퀴즈 형식 오류');
    final question = QuizQuestion(
      id: item['id'],
      question: item['question'],
      choices: List<String>.from(item['choices']),
      correctIndex: item['correctIndex'] as int?,
      explanation: item['explanation'] as String? ?? '',
    );
    if (!question.isValid) throw const FormatException('4지선다 퀴즈가 아닙니다.');
    return question;
  }).toList();
}

class QuizFeedback {
  const QuizFeedback(this.correct, this.explanation);
  final bool correct;
  final String explanation;
}
