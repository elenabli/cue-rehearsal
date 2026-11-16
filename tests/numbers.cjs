// Numbers said as words but written by recognition as digits («шестнадцать лет» → «16 лет»), and the other way round.
const assert=require('node:assert/strict');const C=require('../dist/core.js');
for(const [line,heard] of [['Шестнадцать лет.','16 лет'],['Ей шестнадцать лет!','ей 16 лет'],['Шестнадцатого ноября','16-го ноября'],['Двадцать пять рублей','25 рублей'],['В тысяча девятьсот восемьдесят пятом году','в 1985 году'],['Две тысячи','2000'],['Триста шестьдесят пять дней','365 дней'],['Сто человек','100 человек'],['Ему 16 лет','ему шестнадцать лет'],['Twenty five years','25 years'],['One hundred','100']])
 assert(C.matches(line,heard),line+' ← '+heard);
assert(!C.matches('Шестнадцать лет','17 лет'),'a different number is still wrong');
assert(!C.matches('Две тысячи','1000'),'«две тысячи» is not 1000');
assert.equal(C.progress('Ей шестнадцать лет, понимаешь?','ей 16 лет').heard,3,'the marker follows a number heard as digits');
console.log('Numbers passed: number words match digits in any case form, compounds and years.');
