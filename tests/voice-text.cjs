// The partner's voice says only the words: no quotes, brackets or signs read aloud.
const assert=require('node:assert/strict');const fs=require('node:fs');
const src=fs.readFileSync('dist/app.js','utf8');const spokenText=new Function(src.match(/function spokenText[^\n]*/)[0]+';return spokenText;')();
assert.equal(spokenText('Он сказал: "Привет" и ушёл.'),'Он сказал: Привет и ушёл.');
assert.equal(spokenText('«Ну и что?» <смеётся>'),'Ну и что? смеётся');
assert.equal(spokenText('&quot;Да&quot;, &lt;нет&gt;'),'Да, нет');
assert.equal(spokenText('Если тебя увидят - в лучшем случае'),'Если тебя увидят, в лучшем случае');
assert.equal(spokenText("It's 'fine' *really*"),"It's fine really");
assert.equal(spokenText('Да-да, кто-то.'),'Да-да, кто-то.','hyphens inside words stay');
assert.equal(spokenText('Строка один.\nСтрока два.'),'Строка один.\nСтрока два.','line breaks stay');
console.log('Voice text passed: quotes, brackets, signs and spaced dashes are not read aloud.');
