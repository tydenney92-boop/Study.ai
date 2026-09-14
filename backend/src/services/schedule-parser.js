const crypto = require("crypto");

const MONTHS = { jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,september:9,sept:9,sep:9,october:10,oct:10,november:11,nov:11,december:12,dec:12 };
const ALLOWED_TYPES = new Set(["assignment", "quiz", "exam", "reading", "project", "paper", "other"]);
const ACADEMIC_EVENT = /\b(assignment|homework|problem set|quiz|exam|midterm|final(?: exam)?|project|paper|presentation|reading|lab|discussion)\b/i;
const SCHEDULE_HEADING = /^(?:(?:course\s+)?(?:schedule|calendar)|(?:weekly|important dates?|assignment|exam|tentative)\s+(?:schedule|calendar|dates?))$/i;
const GENERIC_HEADING = /^[A-Z][A-Za-z &/()-]{2,50}:?$/;
const SUPPRESSED_CONTEXT = /\b(office hours?|instructor|teaching assistant|\bta\b|contact|phone|telephone|email|accommodations?|accessibility|disability|policy|policies|copyright|published|publication|textbook|isbn)\b/i;
const RELATIVE_DATE = /\b(following|next)\s+(mon|tues|wednes|thurs|fri|satur|sun)day\b|\bduring finals week\b|\bbefore class\b|\blast day of class\b/i;
const DATE_LIKE = /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}\b/i;
const STRATEGIES = ["structured_event_blocks", "delimited_rows", "schedule_tables", "natural_language"];

function normalizeSource(text) {
    return String(text || "").replace(/\r\n?/g, "\n").replace(/[\u00a0\u2007\u202f]/g, " ")
        .replace(/[：﹕]/g, ":").replace(/[│┃]/g, "|").replace(/[‐‑‒–—]/g, "-")
        .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}
function semesterYear(value) { const match = String(value || "").match(/\b(20\d{2})\b/); return match ? Number(match[1]) : null; }
function validDate(year, month, day) { const date = new Date(year, month - 1, day); return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day; }
function dateResult(year, month, day, text, inferred = false) { return year && validDate(year, month, day) ? { date:`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`, text, inferred } : null; }
function parseDate(line, contextYear) {
    let match = String(line || "").match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if (match) return dateResult(Number(match[1]), Number(match[2]), Number(match[3]), match[0]);
    match = String(line || "").match(/\b(January|February|March|April|May|June|July|August|September|Sept\.?|Sep\.?|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Oct\.?|Nov\.?|Dec\.?)\s+(\d{1,2})(?:,?\s+(20\d{2}))?/i);
    if (match) { const month=MONTHS[match[1].toLowerCase().replace(".","")],year=Number(match[3]||contextYear); return dateResult(year,month,Number(match[2]),match[0],!match[3]); }
    match = String(line || "").match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}|\d{2}))?\b/);
    if (match) { let year=match[3]?Number(match[3]):contextYear;if(year&&year<100)year+=2000;return dateResult(year,Number(match[1]),Number(match[2]),match[0],!match[3]); }
    return null;
}
function parseTime(line) {
    const value=String(line||""); if (/\btime\s*:\s*(?:none|n\/?a|-)?\s*$/i.test(value)) return null;
    const range=value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:AM|PM)?\s*-\s*\d{1,2}(?::\d{2})?\s*(AM|PM)\b/i),match=range||value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
    if(match){let hour=Number(match[1])%12;if(match[3].toUpperCase()==="PM")hour+=12;return`${String(hour).padStart(2,"0")}:${match[2]||"00"}`;}
    const military=value.match(/(?:\bat\s+|\btime\s*:\s*|,\s*|\|\s*|\b)([01]?\d|2[0-3]):([0-5]\d)\b/i);return military?`${String(Number(military[1])).padStart(2,"0")}:${military[2]}`:null;
}
function isReview(text) { return /\b(?:exam|midterm|final)\s*\d*\s+review\b|\breview\s+(?:for\s+)?(?:exam|midterm|final)\b/i.test(text); }
function typeFor(text) { if(isReview(text))return"other";if(/\b(midterm|final exam|exam)\b/i.test(text))return"exam";if(/\bquiz\b/i.test(text))return"quiz";if(/\b(project|presentation)\b/i.test(text))return"project";if(/\bpaper\b/i.test(text))return"paper";if(/\breading\b/i.test(text))return"reading";return/\b(assignment|homework|hw|problem set)\b/i.test(text)?"assignment":"other"; }
function explicitType(value) { const normalized=String(value||"").toLowerCase().replace(/[^a-z ]/g," ").replace(/\s+/g," ").trim();if(ALLOWED_TYPES.has(normalized))return normalized;if(["homework","problem set","hw"].includes(normalized))return"assignment";if(["midterm","final","final exam"].includes(normalized))return"exam";return null; }
function identityKey(title,eventKind){const normalized=String(title||"").toLowerCase().replace(/\b(?:due|deadline)\b/g,"").replace(/[^a-z0-9]+/g," ").trim();return crypto.createHash("sha256").update(`${eventKind}|${normalized}`).digest("hex");}
function candidate({title,type,parsed,time,sourceText,confidence,parserStrategy}) { const review=isReview(title),resolvedType=review?"other":type,eventKind=review?"exam_review":resolvedType;return{key:identityKey(title,eventKind),title:title.trim().slice(0,200),type:resolvedType,eventKind,dateText:parsed?.text||null,dueDate:parsed?.date||null,dueTime:time||null,sourceText:sourceText.trim().slice(0,500),confidence,status:parsed?"confirmed":"ambiguous",selected:Boolean(parsed&&confidence!=="low"&&!review),yearInferred:Boolean(parsed?.inferred),extractionSource:"deterministic",parserStrategy}; }
function field(record,name,following) { const lookahead=following.map(value=>value.replace(" ","\\s+")).join("|");return record.match(new RegExp(`\\b${name}\\s*:\\s*([\\s\\S]*?)(?=\\s+\\b(?:${lookahead})\\s*:|$)`,`i`))?.[1]?.trim()||""; }
function structuredRecords(text) { const expanded=text.replace(/\s+(?=EVENT\s+Title\s*:)/gi,"\n\n"),eventRecords=[...expanded.matchAll(/(?:^|\n)EVENT\b([\s\S]*?)(?=(?:\nEVENT\b)|$)/gi)].map(match=>`EVENT${match[1]}`.trim()),looseRecords=expanded.split(/\n\s*\n+/).filter(record=>/\bTitle\s*:/i.test(record));return[...new Set([...eventRecords,...looseRecords])]; }
function parseStructured(text,year) { const results=[];for(const record of structuredRecords(text)){const title=field(record,"Title",["Type","Date","Due","Time","Notes"]),typeValue=field(record,"Type",["Title","Date","Due","Time","Notes"]),dateValue=field(record,"(?:Date|Due)",["Title","Type","Time","Notes"]),type=typeValue?explicitType(typeValue):typeFor(title),parsed=parseDate(dateValue,year);if(!title||!parsed||!type||(type==="other"&&!ACADEMIC_EVENT.test(title)))continue;results.push(candidate({title,type,parsed,time:parseTime(record),sourceText:record,confidence:"high",parserStrategy:"structured_event_blocks"}));}return results; }
function parseDelimited(text,year) { const results=[];for(const line of text.split("\n")){if(!line.includes("|")||SUPPRESSED_CONTEXT.test(line))continue;const cells=line.split("|").map(value=>value.trim()).filter(Boolean),dateIndex=cells.findIndex(value=>parseDate(value,year));if(dateIndex<0)continue;const parsed=parseDate(cells[dateIndex],year),explicit=cells.map(explicitType).find(Boolean),academicCells=cells.filter((value,index)=>index!==dateIndex&&ACADEMIC_EVENT.test(value)),title=academicCells[0],type=explicit||typeFor(title);if(!title||!type||(type==="other"&&!ACADEMIC_EVENT.test(title)))continue;results.push(candidate({title,type,parsed,time:parseTime(line),sourceText:line,confidence:"high",parserStrategy:"delimited_rows"}));}return results; }
function scheduleLines(text) { const lines=text.split("\n").map((raw,index)=>({raw:raw.trim(),line:raw.replace(/\s+/g," ").trim(),index}));let inSchedule=false,foundSchedule=false;return lines.map(entry=>{if(SCHEDULE_HEADING.test(entry.line.replace(/:$/,"").trim())){inSchedule=true;foundSchedule=true;return{...entry,isHeading:true,inSchedule:false};}if(inSchedule&&GENERIC_HEADING.test(entry.line)&&!parseDate(entry.line,null)&&!ACADEMIC_EVENT.test(entry.line))inSchedule=false;return{...entry,inSchedule};}).map(entry=>({...entry,hasSchedule:foundSchedule})); }
function cleanScheduleTitle(line,dateText) { let title=line.replace(dateText||"","").trim();title=title.replace(/^(?:\||-\s*)?(?:M|T|W|Th|F|Sa|Su|Mon|Tue|Tues|Wed|Thu|Thur|Fri|Sat|Sun)\b\.?\s*/i,"").replace(/^\s*(?:\||-)+\s*/,"").replace(/\s*(?:\||-)+\s*(?:\d+\s*)?(?:\||[-\s])*$/g,"").replace(/\s*\([^)]*(?:\d{1,2}\s*-\s*\d{1,2}\s*(?:am|pm)|\d{3,5}\s+[A-Z]{2,})[^)]*\)\s*/ig," ");const event=title.match(/\b(?:Exam\s*\d+\s+Review|Midterm\s*\d*\s+Review|Final(?: Exam)?\s+Review|Exam\s*\d+|Midterm\s*\d*|Final Exam|Final|(?:Homework|HW|Assignment|Problem Set|Quiz|Project|Paper|Presentation)\s*[A-Za-z0-9.-]*)\b/i);return(event?.[0]||title).replace(/\s+/g," ").trim().slice(0,200)||"Scheduled coursework"; }
function proseTitle(line,dateText) { return line.replace(/^\s*(?:week\s*\d+\s*[-|:]\s*)?/i,"").replace(dateText||"","").replace(/\b(?:due|held|on|at)\b\s*[:-]?\s*$/i,"").replace(/[|-]+\s*$/g,"").trim().slice(0,200)||"Scheduled coursework"; }
function parseHeuristic(text,year) {
    const results=[],entries=scheduleLines(text),hasSchedule=entries.some(entry=>entry.hasSchedule);
    for(let index=0;index<entries.length;index++){
        const entry=entries[index];let{line,raw,inSchedule,isHeading}=entry;
        if(!line||isHeading||line.includes("|")||/\bTitle\s*:.*\b(?:Date|Due)\s*:/i.test(line)||SUPPRESSED_CONTEXT.test(line)||/%/.test(line)||/^\s*(?:title|type|date|due|time|notes)\s*:/i.test(line))continue;
        const next=entries[index+1];
        if(ACADEMIC_EVENT.test(line)&&!DATE_LIKE.test(line)&&next?.line&&DATE_LIKE.test(next.line)&&!SUPPRESSED_CONTEXT.test(next.line)){line=`${line} ${next.line}`;raw=`${raw}\n${next.raw}`;inSchedule=inSchedule||next.inSchedule;index++;}
        const parsed=parseDate(line,year),relative=RELATIVE_DATE.test(line),academic=ACADEMIC_EVENT.test(line),review=isReview(line),explicitDue=/\b(due|deadline|held)\b/i.test(line);
        if(!academic)continue;if(hasSchedule&&!inSchedule&&!explicitDue)continue;if(!inSchedule&&!parsed&&!relative)continue;if(inSchedule&&!parsed&&!relative)continue;
        const title=inSchedule?cleanScheduleTitle(line,parsed?.text):proseTitle(line,parsed?.text);if(!ACADEMIC_EVENT.test(title))continue;
        let confidence=inSchedule&&parsed&&!review?"high":parsed?"moderate":"low";if(explicitDue&&parsed)confidence="high";
        results.push(candidate({title,type:typeFor(title),parsed,time:parseTime(line),sourceText:raw||line,confidence,parserStrategy:inSchedule?"schedule_tables":"natural_language"}));
    }
    return results;
}
function mergeCandidates(groups,maxCandidates) { const merged=new Map();let beforeFiltering=0;for(const group of groups)for(const item of group){beforeFiltering++;const current=merged.get(item.key);if(!current||(current.confidence!=="high"&&item.confidence==="high")||(!current.dueTime&&item.dueTime))merged.set(item.key,item);}return{candidates:[...merged.values()].slice(0,maxCandidates),beforeFiltering}; }
function countDateTokens(text) { return(text.match(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}\b/gi)||[]).length; }
function parseSchedule(rawText,{semester="",maxCandidates=100}={}) { const text=normalizeSource(rawText),year=semesterYear(semester),structured=parseStructured(text,year),delimited=parseDelimited(text,year),heuristic=parseHeuristic(text,year),scheduleTable=heuristic.filter(item=>item.parserStrategy==="schedule_tables"),natural=heuristic.filter(item=>item.parserStrategy==="natural_language"),{candidates,beforeFiltering}=mergeCandidates([structured,delimited,scheduleTable,natural],maxCandidates);candidates.sort((left,right)=>text.indexOf(left.sourceText)-text.indexOf(right.sourceText));const summary={confirmed:candidates.filter(item=>item.status==="confirmed").length,ambiguous:candidates.filter(item=>item.status==="ambiguous").length,highConfidence:candidates.filter(item=>item.confidence==="high").length,other:candidates.filter(item=>item.confidence!=="high").length};return{parserMode:"deterministic",candidates,summary,diagnostics:{extractedCharacters:text.length,dateTokenCount:countDateTokens(text),strategiesAttempted:STRATEGIES,strategyCandidateCounts:{structured_event_blocks:structured.length,delimited_rows:delimited.length,schedule_tables:scheduleTable.length,natural_language:natural.length},candidatesBeforeFiltering:beforeFiltering,candidatesAfterFiltering:candidates.length,scheduleLike:/\b(?:event|schedule|calendar|deadline|due|assignment|homework|quiz|exam|project|paper|reading)\b/i.test(text)}}; }

module.exports={ACADEMIC_EVENT,ALLOWED_TYPES,DATE_LIKE,STRATEGIES,SUPPRESSED_CONTEXT,countDateTokens,explicitType,identityKey,isReview,normalizeSource,parseDate,parseSchedule,parseTime,scheduleLines,semesterYear,typeFor};
