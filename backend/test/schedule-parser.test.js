const test=require("node:test"),assert=require("node:assert/strict"),{parseSchedule,parseDate,parseTime}=require("../src/services/schedule-parser");
test("schedule parser extracts explicit prose and table deadlines with semester year",()=>{const result=parseSchedule(`Homework 1 due September 12\nQuiz 1 due September 19\nMidterm held October 10\nWeek | Topic | Assignment | Due\n1 | Supply & Demand | Problem Set 1 | Sep 8`,{semester:"Fall 2026",materialId:4});assert.deepEqual(result.candidates.map(x=>x.dueDate),["2026-09-12","2026-09-19","2026-10-10","2026-09-08"]);assert.deepEqual(result.candidates.map(x=>x.type),["assignment","quiz","exam","assignment"]);assert.ok(result.candidates.every(x=>x.sourceText&&x.key))});
test("schedule parser preserves time and flags unsupported relative dates",()=>{assert.equal(parseTime("Problem Set due Sep 18 at 11:59 PM"),"23:59");const result=parseSchedule("Midterm 1 will be held Thursday, October 8.\nProblem Set 4 is due the following Monday at 11:59 PM.\nFinal paper due during finals week.",{semester:"Fall 2026",materialId:2});assert.equal(result.candidates[0].dueDate,"2026-10-08");assert.equal(result.candidates[1].status,"ambiguous");assert.equal(result.candidates[2].status,"ambiguous");assert.equal(parseDate("Quiz 09/18/2026",null).date,"2026-09-18")});
test("schedule sections prioritize actual exams and suppress unrelated dated prose",()=>{const result=parseSchedule(`Instructor office hours: Sep 2 at 3 PM, room 3712 HBLL
Textbook published 2024. Accommodation requests are due September 4.
Grading: 60% Three exams

Schedule
Date Day L# Topics Text HW Proj
Sep 24 Th - Exam 1 Review - 6 -
Sep 29 T - Exam 1 - - -
Nov 3 T - Exam 2 Review - 12 -
Nov 5 Th - Exam 2 - - -
Dec 8 T - Exam 3 Review - 19 Proj 3
Dec 12 Sa - Exam 3 (7-10am, 3712 HBLL) - - -`,{semester:"Fall 2026",materialId:9});const exams=result.candidates.filter(x=>x.type==="exam");assert.deepEqual(exams.map(x=>[x.title,x.dueDate,x.dueTime,x.selected]),[["Exam 1","2026-09-29",null,true],["Exam 2","2026-11-05",null,true],["Exam 3","2026-12-12","07:00",true]]);const reviews=result.candidates.filter(x=>x.eventKind==="exam_review");assert.equal(reviews.length,3);assert.ok(reviews.every(x=>x.type==="other"&&!x.selected));assert.ok(result.candidates.every(x=>!x.sourceText.includes("office hours")&&!x.sourceText.includes("Accommodation")));assert.equal(reviews[0].sourceText,"Sep 24 Th - Exam 1 Review - 6 -")});
test("screenshot rows, messy OCR, and mixed time formats preserve line evidence",()=>{const result=parseSchedule(`Assignment Schedule\nHomework 3\nDue Sep 18 at 11:59 PM\nQuiz 1     Sep 20 at 13:30\nMidterm 1\nSep 25\nOffice hours Sep 10 at 14:00\nFinal Exam Review\nDec 8`,{semester:"Fall 2026"});assert.deepEqual(result.candidates.map(x=>[x.title,x.dueDate,x.dueTime,x.type]),[["Homework 3","2026-09-18","23:59","assignment"],["Quiz 1","2026-09-20","13:30","quiz"],["Midterm 1","2026-09-25",null,"exam"],["Final Exam Review","2026-12-08",null,"other"]]);assert.ok(result.candidates[0].sourceText.includes("\n"));assert.equal(result.candidates[3].selected,false)});

test("structured EVENT blocks deterministically preserve explicit fields",()=>{const result=parseSchedule(`EVENT
Title: Homework 1
Type: Assignment
Date: 2026-09-08
Time: None

EVENT
Title: Exam 1
Type: Exam
Date: 2026-09-29
Time: 09:30`,{semester:"Fall 2026"});assert.deepEqual(result.candidates.map(x=>[x.title,x.type,x.dueDate,x.dueTime,x.confidence,x.parserStrategy]),[["Homework 1","assignment","2026-09-08",null,"high","structured_event_blocks"],["Exam 1","exam","2026-09-29","09:30","high","structured_event_blocks"]]);assert.equal(result.diagnostics.dateTokenCount,2);assert.equal(result.diagnostics.candidatesBeforeFiltering,2)});

test("structured parsing accepts date formats, loose records, delimited rows, and collapsed OCR",()=>{for(const [source,dates] of [[`Title: Homework 1\nDue: 2026/09/08\nType: Homework\n\nTitle: Exam 1\nDate: Sep 29, 2026\nType: Midterm`,["2026-09-08","2026-09-29"]],[`Homework 1 | Assignment | 09/08/2026\nExam 1 | Exam | 2026-09-29 | 09:30`,["2026-09-08","2026-09-29"]],[`EVENT Title: Homework 1 Type: Assignment Date: 2026-09-08 Time: N/A EVENT Title: Exam 1 Type: Exam Date: 2026-09-29 Time: 09:30`,["2026-09-08","2026-09-29"]]]){const result=parseSchedule(source,{semester:"Fall 2026"});assert.deepEqual(result.candidates.map(x=>x.dueDate),dates);assert.ok(result.candidates.every(x=>x.confidence==="high"))}});
