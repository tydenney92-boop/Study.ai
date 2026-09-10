const crypto = require("crypto");
const MONTHS = { jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12 };
const KEYWORDS = /\b(assignment|homework|problem set|quiz|exam|midterm|final|project|paper|presentation|reading|lab|discussion)\b/i;
function semesterYear(value) { const match=String(value||"").match(/\b(20\d{2})\b/); return match?Number(match[1]):null; }
function validDate(year,month,day) { const date=new Date(year,month-1,day); return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day; }
function typeFor(text) { if(/\b(midterm|final exam|exam)\b/i.test(text))return"exam";if(/\bquiz\b/i.test(text))return"quiz";if(/\b(project|presentation)\b/i.test(text))return"project";if(/\bpaper\b/i.test(text))return"paper";if(/\breading\b/i.test(text))return"reading";return/\b(assignment|homework|problem set)\b/i.test(text)?"assignment":"other"; }
function parseDate(line,contextYear) {
 let match=line.match(/\b(January|February|March|April|May|June|July|August|September|Sept\.?|Sep\.?|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Oct\.?|Nov\.?|Dec\.?)\s+(\d{1,2})(?:,?\s+(20\d{2}))?/i);
 if(match){const month=MONTHS[match[1].toLowerCase().replace(".","")],year=Number(match[3]||contextYear);return year&&validDate(year,month,Number(match[2]))?{date:`${year}-${String(month).padStart(2,"0")}-${String(Number(match[2])).padStart(2,"0")}`,text:match[0],inferred:!match[3]}:null;}
 match=line.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}|\d{2}))?\b/);
 if(match){let year=match[3]?Number(match[3]):contextYear;if(year&&year<100)year+=2000;return year&&validDate(year,Number(match[1]),Number(match[2]))?{date:`${year}-${match[1].padStart(2,"0")}-${match[2].padStart(2,"0")}`,text:match[0],inferred:!match[3]}:null;}
 return null;
}
function parseTime(line) { const match=line.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);if(!match)return null;let hour=Number(match[1])%12;if(match[3].toUpperCase()==="PM")hour+=12;return`${String(hour).padStart(2,"0")}:${match[2]||"00"}`; }
function titleFor(line,dateText) { return line.replace(/^\s*(?:week\s*\d+\s*[-–—|:]\s*)?/i,"").replace(dateText||"","").replace(/\b(?:due|held|on|at)\b\s*[:–—-]?\s*$/i,"").replace(/[|–—-]+\s*$/g,"").trim().slice(0,200)||"Scheduled coursework"; }
function parseSchedule(text,{semester="",materialId,maxCandidates=100}={}) {
 const year=semesterYear(semester),candidates=[],seen=new Set();
 for(const raw of String(text||"").split(/\r?\n/)){
  const line=raw.replace(/\s+/g," ").trim();
  if(!line||!KEYWORDS.test(line)||(/^week\b/i.test(line)&&/\bdue\b/i.test(line)&&!/\d/.test(line)))continue;
  const parsed=parseDate(line,year),relative=/\b(following|next)\s+(mon|tues|wednes|thurs|fri|satur|sun)day\b|\bduring finals week\b|\bbefore class\b/i.test(line),ambiguous=!parsed||relative&&!parsed;
  const key=crypto.createHash("sha256").update(`${materialId}|${line.toLowerCase()}`).digest("hex");
  if(seen.has(key))continue;seen.add(key);
  candidates.push({key,title:titleFor(line,parsed?.text),type:typeFor(line),dateText:parsed?.text||null,dueDate:parsed?.date||null,dueTime:parseTime(line),sourceText:line.slice(0,500),confidence:parsed?"high":"low",status:ambiguous?"ambiguous":"confirmed",selected:!ambiguous,yearInferred:Boolean(parsed?.inferred)});
  if(candidates.length>=maxCandidates)break;
 }
 return {parserMode:"deterministic",candidates,summary:{confirmed:candidates.filter(x=>x.status==="confirmed").length,ambiguous:candidates.filter(x=>x.status==="ambiguous").length}};
}
module.exports={parseSchedule,parseDate,parseTime,semesterYear,typeFor};
