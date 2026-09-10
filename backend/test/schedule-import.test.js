const test=require("node:test"),assert=require("node:assert/strict"),supertest=require("supertest");
const {createTestApp,authenticatedRequest,insertMaterial}=require("./helpers/test-app");
test("schedule preview requires review and confirmed import is transactional and duplicate-safe",async t=>{
 const ctx=createTestApp();t.after(ctx.cleanup);
 ctx.database.prepare("UPDATE courses SET semester='Fall 2026' WHERE id=1").run();
 const id=insertMaterial(ctx.database,{originalFilename:"syllabus.txt",extractedText:"Homework 1 — September 12\nQuiz 1 — September 19\nFinal paper due during finals week."});
 const preview=(await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/preview").send({materialId:id}).expect(200)).body;
 assert.equal(preview.summary.confirmed,2);assert.equal(preview.summary.ambiguous,1);assert.equal(preview.candidates[2].selected,false);
 const chosen=preview.candidates.slice(0,2).map((x,i)=>({key:x.key,title:i?"Edited Quiz":"Homework 1",type:x.type,dueAt:i?"2026-09-20T05:59:00.000Z":"2026-09-13T05:59:00.000Z"}));
 let result=(await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/confirm").send({materialId:id,candidates:chosen}).expect(201)).body;assert.equal(result.created,2);
 result=(await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/confirm").send({materialId:id,candidates:chosen}).expect(201)).body;assert.equal(result.created,0);assert.equal(result.skipped,2);
 const tasks=(await authenticatedRequest(ctx.app).get("/api/tasks")).body;assert.equal(tasks.length,2);assert.equal(tasks[1].scheduleSourceMaterialId,id);assert.match(tasks[1].scheduleSourceSnippet,/Quiz 1/);
});
test("schedule import enforces material ownership and usable extraction",async t=>{const ctx=createTestApp();t.after(ctx.cleanup);const bad=insertMaterial(ctx.database,{originalFilename:"scan.pdf",extractedText:"",extractionStatus:"no_text"});await authenticatedRequest(ctx.app).post("/api/courses/1/schedule-import/preview").send({materialId:bad}).expect(409);const other=supertest.agent(ctx.app);await other.post("/api/auth/register").send({name:"Other",email:"schedule-other@example.com",password:"StrongPass123!"}).expect(201);await other.post("/api/courses/1/schedule-import/preview").send({materialId:bad}).expect(404)});
