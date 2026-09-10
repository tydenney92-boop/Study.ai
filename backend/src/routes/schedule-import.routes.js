const express=require("express"),{positiveInteger,requestObject}=require("../utils/validation");
function createScheduleImportRouter({service}){const r=express.Router({mergeParams:true});r.use((q,s,n)=>{q.courseId=positiveInteger(q.params.courseId,"courseId");n()});r.post("/preview",(q,s)=>{requestObject(q.body);s.json(service.preview(q.courseId,q.user.id,q.body.materialId))});r.post("/confirm",(q,s)=>{requestObject(q.body);s.status(201).json(service.import(q.courseId,q.user.id,q.body))});return r}
module.exports={createScheduleImportRouter};
