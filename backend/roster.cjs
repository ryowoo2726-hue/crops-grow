// Excel CSV의 따옴표, 쉼표, 줄바꿈과 UTF-8 BOM을 처리합니다.
function parseRoster(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else {
        if (!quoted && field) throw Error('CSV 따옴표 형식을 확인하세요.');
        quoted = !quoted;
      }
    } else if (!quoted && (char === ',' || char === '\n' || char === '\r')) {
      row.push(field.trim()); field = '';
      if (char !== ',') {
        if (row.some(value => value)) rows.push(row);
        row = [];
        if (char === '\r' && text[i + 1] === '\n') i++;
      }
    } else field += char;
  }
  if (quoted) throw Error('CSV 따옴표가 닫히지 않았습니다.');
  row.push(field.trim());
  if (row.some(value => value)) rows.push(row);
  const headers = rows.shift() || [];
  const columns = ['학년', '반', '번호', '성명'].map(label => headers.indexOf(label));
  if (columns.includes(-1) || !rows.length) throw Error('학생 명단 CSV에 학년·반·번호·성명과 학생 행이 필요합니다.');
  const identities = new Set();
  return rows.map((values, index) => {
    const [grade, classNo, number] = columns.slice(0, 3).map(column => Number(values[column]));
    const name = values[columns[3]];
    const identity = `${grade}-${classNo}-${number}`;
    if (!Number.isInteger(grade) || grade < 1 || grade > 3 ||
        ![classNo, number].every(value => Number.isInteger(value) && value >= 1 && value <= 99) ||
        !name || name.length > 50 || /[\p{Cc}\p{Cf}]/u.test(name) || identities.has(identity))
      throw Error(`학생 명단 CSV ${index + 2}행의 학년·반·번호·성명 또는 중복을 확인하세요.`);
    identities.add(identity);
    return {grade, classNo, number, name};
  });
}
module.exports = {parseRoster};
