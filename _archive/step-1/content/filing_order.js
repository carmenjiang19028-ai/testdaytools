(()=>{
const KEY='tdt-skills-filing-v2', LEGACY_KEY='tdt-skills-filing-v1', SCHEMA=2;
const REVIEW_LIMIT=5;
let seed=Date.now()%1000000, round=0, current=null, history=[], startedTracked=false, completeTracked=false, attemptType='first';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const rng=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296};
const pick=a=>a[Math.floor(rng()*a.length)];
function shuffle(values){
  for(let j=values.length-1;j>0;j--){const k=Math.floor(rng()*(j+1));[values[j],values[k]]=[values[k],values[j]]}
  return values;
}
const textCmp=(a,b)=>{a=a.toUpperCase();b=b.toUpperCase();return a<b?-1:a>b?1:0};
function alphaKey(v){return v.toUpperCase().split(/(\d+)/).filter(Boolean).map(x=>/^\d+$/.test(x)?[1,Number(x),x.length]:[0,x,0])}
function decision(a,b,rule){
  for(const [key,label] of rule==='name'?[['last','Last name'],['first','First name']]:rule==='date'?[['date','Date']]:[]){
    const order=textCmp(a[key],b[key]);
    if(order)return {order,reason:`${label} decides: ${a[key]} comes before ${b[key]}.`};
  }
  if(rule==='alpha'){
    const left=alphaKey(a.code),right=alphaKey(b.code);
    for(let i=0;i<Math.max(left.length,right.length);i++){
      const x=left[i],y=right[i];
      if(!x||!y)return {order:!x?-1:1,reason:`The shorter exact prefix comes first: ${a.code} before ${b.code}.`};
      if(x[0]!==y[0])return {order:x[0]-y[0],reason:'At the first different chunk, text comes before a numeric chunk.'};
      if(x[1]!==y[1])return {order:x[1]<y[1]?-1:1,reason:x[0]?`Numeric value decides: ${x[1]} is less than ${y[1]}.`:`Text decides: ${x[1]} comes before ${y[1]} A–Z.`};
      if(x[0]===1&&x[2]!==y[2])return {order:x[2]-y[2],reason:`The digits have the same value (${x[1]}). ${a.code} comes first because its digit chunk has fewer leading zeros.`};
    }
  }
  const tied=rule==='name'?'Both names match':rule==='date'?'Both dates match':'Both codes match';
  return {order:textCmp(a.id,b.id),reason:`${tied}, so the record ID decides: ${a.id} comes before ${b.id} A–Z.`};
}
function ordered(rows,rule){return [...rows].sort((a,b)=>decision(a,b,rule).order)}
function questionId(q){return [q.seed,q.rule,q.rows.map(r=>JSON.stringify(r)).join('|'),q.correct].join('::')}
function validRow(r,rule){return !!r&&typeof r.id==='string'&&((rule==='name'&&typeof r.last==='string'&&typeof r.first==='string')||(rule==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(r.date))||(rule==='alpha'&&typeof r.code==='string'))}
function validCurrent(q){return !!q&&['name','date','alpha'].includes(q.rule)&&Array.isArray(q.rows)&&q.rows.length===4&&q.rows.every(r=>validRow(r,q.rule))&&Number.isInteger(q.correct)&&q.correct>=0&&q.correct<4&&(q.answered===null||Number.isInteger(q.answered)&&q.answered>=0&&q.answered<4)&&q.questionId===questionId(q)}
function validHistory(h){return Array.isArray(h)?h.filter(x=>x&&['name','date','alpha'].includes(x.rule)&&Number.isInteger(x.chosen)&&x.chosen>=0&&x.chosen<4&&Number.isInteger(x.correct)&&x.correct>=0&&x.correct<4&&typeof x.ok==='boolean'&&(!x.questionId||typeof x.questionId==='string')):[]}
function make(){
  const rule=$('[data-rule]').value;
  let examples;
  if(rule==='name'){
    const last=pick(['Bennett','Chandra','Diaz','Ellis']);
    const differentLast=[{last,first:'Zoe'},{last:'Foster',first:'Ari'}];
    const sameLast=[{last,first:'Ari'},{last,first:'Zoe'}];
    const sameName=[{last,first:'Ari'},{last,first:'Ari'}];
    examples=[sameLast,sameName,differentLast][round%3].concat([{last:'Nguyen',first:'Linh'},{last:'Patel',first:'Dev'}]);
  }else if(rule==='date'){
    const day=pick(['08','12','17','24']);
    const firstTwo=round%2?[`2026-01-${day}`,`2026-01-${day}`]:[`2025-12-${day}`,`2026-01-${day}`];
    examples=firstTwo.concat(['2026-02-14','2026-03-04']).map(date=>({date}));
  }else{
    const prefix=pick(['A','C','E','K']), n=2+Math.floor(rng()*7);
    const base=`${prefix}-${n}`, larger=`${prefix}-${n+10}`;
    const pair=[[base,larger],[base,`${prefix}-0${n}`],[base,`${base}B`],[base,base]][round%4];
    examples=pair.concat([`${prefix}-${n+30}`,'R-1']).map(code=>({code}));
  }
  const offset=10+Math.floor(rng()*15), prefix=rule==='name'?'R':rule==='date'?'D':'C';
  const ids=shuffle(examples.map((_,j)=>`${prefix}-${offset+j*13}`));
  const rows=shuffle(examples.map((entry,j)=>({...entry,id:ids[j]})));
  current={seed,rule,rows,correct:rows.indexOf(ordered(rows,rule)[0]),answered:null};
  current.questionId=questionId(current);render();save();
}
function label(rule){return rule==='name'?'Name · last, first, ID':rule==='date'?'Date · earliest first':'Alphanumeric · chunks left to right'}
function display(r,rule){return rule==='name'?`${r.last}, ${r.first} · ${r.id}`:rule==='date'?`${r.date} · ${r.id}`:`${r.code} · ${r.id}`}
function explain(rule,good,bad){return `${display(good,rule)} goes first.${good===bad?'':' '+decision(good,bad,rule).reason}`}
function reviewDetails(entry){
  const review=entry.review;
  return !entry.ok&&validRow(review?.first,entry.rule)&&validRow(review?.chosen,entry.rule)
    &&decision(review.first,review.chosen,entry.rule).order<0?review:null;
}
function keepRecentReviews(){
  let remaining=REVIEW_LIMIT;
  for(let index=history.length-1;index>=0;index--){
    const entry=history[index];
    if(!entry.review) continue;
    if(remaining===0||!reviewDetails(entry)) delete entry.review;
    else remaining--;
  }
}
function renderErrors(letter){
  const names={name:'Name',date:'Date',alpha:'Alphanumeric'};
  const errors=history.filter(entry=>!entry.ok).slice(-REVIEW_LIMIT).reverse();
  const entries=errors.map(entry=>{
    const item=document.createElement('li'), review=reviewDetails(entry);
    const choiceLabel=`${names[entry.rule]}: chose ${letter(entry.chosen)}; first was ${letter(entry.correct)}`;
    if(!review){
      item.textContent=choiceLabel+'. Record details are not available for this earlier answer.';
      return item;
    }
    const details=document.createElement('details'), summary=document.createElement('summary');
    const chosen=document.createElement('p'), first=document.createElement('p'), why=document.createElement('p');
    summary.textContent=choiceLabel;
    chosen.textContent=`You chose: ${display(review.chosen,entry.rule)}`;
    first.textContent=`File first: ${display(review.first,entry.rule)}`;
    why.textContent=decision(review.first,review.chosen,entry.rule).reason;
    details.append(summary,chosen,first,why);
    item.append(details);
    return item;
  });
  if(!entries.length){
    const item=document.createElement('li');
    item.textContent='No filing error recorded yet.';
    entries.push(item);
  }
  $('[data-errors]').replaceChildren(...entries);
}
function render(){
  if(!current)return;
  const rule=current.rule, letter=j=>String.fromCharCode(65+j);
  $('[data-rule]').value=rule;
  $$('[data-filing-rule]').forEach(note=>{note.hidden=note.dataset.filingRule!==rule});
  $('[data-qnum]').textContent=round+1;
  $('[data-rule-label]').textContent=label(rule);
  $('[data-records]').replaceChildren(...current.rows.map((record,index)=>{
    const row=document.createElement('tr'), option=document.createElement('th'), value=document.createElement('td');
    option.scope='row';
    option.textContent=letter(index);
    value.textContent=display(record,rule);
    row.append(option,value);
    return row;
  }));
  $('[data-choices]').innerHTML=current.rows.map((r,j)=>`<button class="choice" type="button" data-choice="${j}" ${current.answered!==null?'disabled':''}>File ${letter(j)} first</button>`).join('');
  $$('[data-choice]').forEach(b=>b.addEventListener('click',()=>answer(Number(b.dataset.choice))));
  const f=$('[data-feedback]'), answerKey=$('[data-filing-order]');
  f.hidden=current.answered===null;
  answerKey.hidden=f.hidden;
  answerKey.replaceChildren();
  if(!f.hidden){
    const ranked=ordered(current.rows,rule), ok=current.answered===current.correct;
    const winner=current.rows[current.correct], chosen=current.rows[current.answered];
    const opponent=ok?ranked.find(row=>decision(winner,row,rule).order<0):chosen;
    $$('[data-choice]').forEach(b=>{const cls=Number(b.dataset.choice)===current.correct?'correct':Number(b.dataset.choice)===current.answered?'wrong':'';if(cls)b.classList.add(cls)});
    const verdict=document.createElement('strong');verdict.textContent=ok?'Correct.':'Not quite.';
    f.replaceChildren(verdict,' '+explain(rule,winner,opponent||winner));
    answerKey.append(...ranked.map(row=>{
      const item=document.createElement('li');
      item.textContent=`${letter(current.rows.indexOf(row))}: ${display(row,rule)}`;
      return item;
    }));
  }
  const correct=history.filter(x=>x.ok).length, recent=history.slice(-5);
  $('[data-done]').textContent=history.length;
  $('[data-correct]').textContent=correct;
  $('[data-accuracy]').textContent=history.length?`${Math.round(correct/history.length*100)}%`:'—';
  $('[data-recent]').textContent=recent.length?`${recent.filter(x=>x.ok).length} / ${recent.length}`:'—';
  $('[data-explanation]').hidden=!f.hidden;
  renderErrors(letter);
}
function answer(n){
  if(!current||current.answered!==null||n<0||n>=current.rows.length)return;
  if(!startedTracked&&typeof window.trackSkillStart==='function')startedTracked=window.trackSkillStart('filing_order',attemptType);
  current.answered=n;
  history.push({questionId:current.questionId,ok:n===current.correct,rule:current.rule,chosen:n,correct:current.correct,
    ...(n!==current.correct?{review:{first:current.rows[current.correct],chosen:current.rows[n]}}:{})});
  if(typeof window.trackSkillAnswer==='function')window.trackSkillAnswer('filing_order');
  if(!completeTracked&&typeof window.trackSkillComplete==='function')completeTracked=window.trackSkillComplete('filing_order');
  save();
  render();
  const feedback=$('[data-feedback]');
  feedback.tabIndex=-1;
  feedback.focus();
}
function save(){
  keepRecentReviews();
  const notice=$('[data-filing-storage-notice]');
  try{
    localStorage.setItem(KEY,JSON.stringify({schema:SCHEMA,seed,round,current,history,startedTracked,completeTracked,attemptType}));
    if(notice) notice.hidden=true;
  }catch(error){
    if(notice) notice.hidden=false;
  }
}
function load(){let h=null;for(const key of [KEY,LEGACY_KEY]){try{h=JSON.parse(localStorage.getItem(key)||'null')}catch(e){h=null}if(h)break}if(h){seed=Number.isFinite(h.seed)?h.seed:seed;round=Number.isInteger(h.round)&&h.round>=0?h.round:0;history=validHistory(h.history);startedTracked=!!h.startedTracked;completeTracked=!!h.completeTracked;attemptType=h.attemptType||'first';if(validCurrent(h.current)){current=h.current;let answerRecord=current.answered===null||history.some(x=>x.questionId===current.questionId&&x.chosen===current.answered&&x.correct===current.correct&&x.ok===(current.answered===current.correct));if(h.schema!==SCHEMA||!answerRecord){current.answered=null;current.questionId=questionId(current);startedTracked=false;completeTracked=false}}else current=null;if(current){render();save()}else make()}else make()}
$('[data-new]').addEventListener('click',()=>{if(startedTracked&&typeof window.trackSkillRetry==='function')window.trackSkillRetry('filing_order');if(startedTracked)attemptType='retry';startedTracked=false;completeTracked=false;round++;make()});$('[data-rule]').addEventListener('change',()=>{if(startedTracked&&typeof window.trackSkillRetry==='function')window.trackSkillRetry('filing_order');if(startedTracked)attemptType='retry';startedTracked=false;completeTracked=false;round++;make()});load()})();
