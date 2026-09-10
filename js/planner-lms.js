(function(){
 const modal=document.querySelector("#lms-modal"),content=document.querySelector("#lms-content"),error=document.querySelector("#lms-error");
 async function render(){
  error.textContent="";
  try{
   const state=await StudyAI.api.get("/api/lms"),connection=state.connections[0];
   if(!connection){content.innerHTML=`<div class="friendly-empty"><strong>Canvas is not connected</strong><span>${state.canvasConfigured?"Connect securely through Canvas OAuth.":"This deployment needs institution-issued Canvas OAuth configuration."}</span>${state.canvasConfigured?'<a class="primary-button" href="/api/lms/canvas/connect">Connect Canvas</a>':""}</div>`;return}
   const [remote,mappings,courses]=await Promise.all([StudyAI.api.get(`/api/lms/${connection.id}/courses`),StudyAI.api.get(`/api/lms/${connection.id}/mappings`),StudyAI.api.get("/api/courses")]);
   content.innerHTML='<div class="lms-status"></div><form class="lms-mappings"></form><div class="app-modal-actions"><button class="danger-button" id="disconnect-lms">Disconnect</button><button class="primary-button" id="sync-lms">Sync Now</button></div>';
   content.querySelector(".lms-status").textContent=`Canvas connected${connection.lastSyncedAt?` · Last synced ${new Date(connection.lastSyncedAt).toLocaleString()}`:" · Not synced yet"}`;
   const form=content.querySelector("form");
   remote.forEach(rc=>{const row=document.createElement("label");row.className="lms-mapping-row";row.innerHTML='<span></span><select><option value="">Do not import</option><option value="new">Create new Study Signal course</option></select>';row.querySelector("span").textContent=`${rc.code||"Canvas"} — ${rc.name}`;courses.forEach(c=>row.querySelector("select").add(new Option(`${c.courseCode} — ${c.courseName}`,c.id)));row.querySelector("select").value=mappings.find(m=>m.externalCourseId===rc.externalId)?.courseId||"";row.dataset.externalId=rc.externalId;row.dataset.name=rc.name;row.dataset.code=rc.code||"Canvas";row.dataset.term=rc.term||"";form.appendChild(row)});
   content.querySelector("#sync-lms").onclick=async()=>{try{const payload=[];for(const row of form.querySelectorAll(".lms-mapping-row")){let value=row.querySelector("select").value;if(!value)continue;if(value==="new"){const created=await StudyAI.api.post("/api/courses",{courseName:row.dataset.name,courseCode:row.dataset.code,semester:row.dataset.term||"Canvas"});value=created.id}payload.push({externalCourseId:row.dataset.externalId,externalCourseName:row.dataset.name,courseId:Number(value)})}await StudyAI.api.put(`/api/lms/${connection.id}/mappings`,{mappings:payload});const result=await StudyAI.api.post(`/api/lms/${connection.id}/sync`,{});StudyAI.ui.notify(`Canvas synced: ${result.assignments} assignments, ${result.created} new, ${result.updated} updated.`,{type:"success"});modal.classList.remove("open");location.reload()}catch(e){error.textContent=e.message}};
   content.querySelector("#disconnect-lms").onclick=async()=>{await StudyAI.api.delete(`/api/lms/${connection.id}`);await render()};
  }catch(e){error.textContent=e.message}
 }
 document.querySelector("#open-lms-import").onclick=()=>{modal.classList.add("open");render()};document.querySelector("#close-lms-modal").onclick=()=>modal.classList.remove("open");
})();
