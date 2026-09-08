const $ = (s) => document.querySelector(s);
const fileInput=$("#fileInput"), pickFilesBtn=$("#pickFilesBtn"), dropZone=$("#dropZone"), uploadList=$("#uploadList"),
emptyState=$("#emptyState"), template=$("#fileCardTemplate"), totalFiles=$("#totalFiles"), totalSize=$("#totalSize"),
pdfCount=$("#pdfCount"), favoriteCount=$("#favoriteCount"), searchInput=$("#searchInput"), categorySelect=$("#categorySelect"),
studentName=$("#studentName"), subjectName=$("#subjectName"), dueDate=$("#dueDate"), tagsInput=$("#tagsInput"),
noteInput=$("#noteInput"), exportBtn=$("#exportBtn"), exportPdfBtn=$("#exportPdfBtn"), clearBtn=$("#clearBtn"),
gridViewBtn=$("#gridViewBtn"), listViewBtn=$("#listViewBtn"), previewModal=$("#previewModal"), previewBody=$("#previewBody"),
previewTitle=$("#previewTitle"), closeModalBtn=$("#closeModalBtn"), openTabBtn=$("#openTabBtn"), downloadPreviewBtn=$("#downloadPreviewBtn");

const DB_NAME="StudyDropProDB", STORE="documents", META_KEY="studydrop_pro_metadata_v1";
let uploads=JSON.parse(localStorage.getItem(META_KEY)||"[]"), activeFilter="all", activeView="grid", currentPreview=null;

const categoryLabels={assignment:"Assignment",notes:"Notes",project:"Project",media:"Media"};

function saveMeta(){localStorage.setItem(META_KEY,JSON.stringify(uploads))}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function saveFile(id,file){const db=await openDB();return new Promise((resolve,reject)=>{const t=db.transaction(STORE,"readwrite");t.objectStore(STORE).put(file,id);t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}
async function getFile(id){const db=await openDB();return new Promise((resolve,reject)=>{const t=db.transaction(STORE,"readonly"),r=t.objectStore(STORE).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function deleteFile(id){const db=await openDB();return new Promise((resolve,reject)=>{const t=db.transaction(STORE,"readwrite");t.objectStore(STORE).delete(id);t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}
async function clearFiles(){const db=await openDB();return new Promise((resolve,reject)=>{const t=db.transaction(STORE,"readwrite");t.objectStore(STORE).clear();t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}

function formatBytes(bytes){if(!bytes)return"0 MB";const u=["B","KB","MB","GB"],i=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),u.length-1),v=bytes/Math.pow(1024,i);return `${v.toFixed(v>=10||i===0?0:1)} ${u[i]}`}
function fileIcon(name,type){const e=name.split(".").pop().toUpperCase();if(type.startsWith("image/"))return"IMG";if(type.startsWith("video/"))return"VID";if(type.includes("pdf"))return"PDF";if(type.includes("word")||["DOC","DOCX"].includes(e))return"DOC";if(type.includes("presentation")||["PPT","PPTX"].includes(e))return"PPT";return e.slice(0,4)||"FILE"}
function currentDetails(){return{student:studentName.value.trim()||"Student",subject:subjectName.value.trim()||"General",category:categorySelect.value,due:dueDate.value,tags:tagsInput.value.split(",").map(x=>x.trim()).filter(Boolean),note:noteInput.value.trim()}}

async function addFiles(fileList){
  const details=currentDetails();
  for(const file of Array.from(fileList)){
    const id=crypto.randomUUID();
    await saveFile(id,file);
    uploads.unshift({id,name:file.name,size:file.size,type:file.type||"application/octet-stream",addedAt:new Date().toISOString(),favorite:false,...details});
  }
  saveMeta();render();
}

function matchesUpload(u){
  const search=searchInput.value.trim().toLowerCase();
  const text=[u.name,u.student,u.subject,u.category,u.note,...(u.tags||[])].join(" ").toLowerCase();
  const filter=activeFilter==="all"||(activeFilter==="favorite"&&u.favorite)||u.category===activeFilter;
  return filter&&(!search||text.includes(search));
}
function renderStats(){
  totalFiles.textContent=uploads.length;
  totalSize.textContent=formatBytes(uploads.reduce((s,u)=>s+Number(u.size||0),0));
  pdfCount.textContent=uploads.filter(u=>u.type.includes("pdf")||u.name.toLowerCase().endsWith(".pdf")).length;
  favoriteCount.textContent=uploads.filter(u=>u.favorite).length;
}

function renderCard(upload){
  const card=template.content.firstElementChild.cloneNode(true);
  const title=card.querySelector("h4"),thumb=card.querySelector(".file-thumb"),meta=card.querySelector(".file-meta"),
  tags=card.querySelector(".tag-row"),remove=card.querySelector(".remove-button"),fav=card.querySelector(".favorite-button"),
  view=card.querySelector(".view-button"),download=card.querySelector(".download-button");
  title.textContent=upload.name;thumb.textContent=fileIcon(upload.name,upload.type);
  meta.textContent=`${categoryLabels[upload.category]} • ${upload.subject} • ${formatBytes(upload.size)}${upload.due?` • Due ${upload.due}`:""}`;
  if(upload.favorite){fav.classList.add("active");fav.textContent="★"}
  [upload.student,...(upload.tags||[])].concat(upload.note?[upload.note]:[]).slice(0,5).forEach(t=>{const s=document.createElement("span");s.className="tag";s.textContent=t;tags.append(s)});
  fav.onclick=()=>{upload.favorite=!upload.favorite;saveMeta();render()};
  remove.onclick=async()=>{if(confirm(`Delete "${upload.name}"?`)){await deleteFile(upload.id);uploads=uploads.filter(x=>x.id!==upload.id);saveMeta();render()}};
  view.onclick=()=>previewFile(upload);download.onclick=()=>downloadFile(upload);
  card.addEventListener("dblclick",()=>previewFile(upload));
  return card;
}
function render(){renderStats();uploadList.classList.toggle("list-view",activeView==="list");uploadList.replaceChildren();uploads.filter(matchesUpload).forEach(u=>uploadList.append(renderCard(u)));emptyState.classList.toggle("visible",uploads.filter(matchesUpload).length===0)}

async function previewFile(upload){
  const file=await getFile(upload.id);
  if(!file){alert("Original file is not available. Please upload it again.");return}
  currentPreview={upload,file,url:URL.createObjectURL(file)};
  previewTitle.textContent=upload.name;previewBody.replaceChildren();
  if(file.type.includes("pdf")||upload.name.toLowerCase().endsWith(".pdf")){
    const iframe=document.createElement("iframe");iframe.src=currentPreview.url;previewBody.append(iframe);
  }else if(file.type.startsWith("image/")){
    const img=document.createElement("img");img.src=currentPreview.url;previewBody.append(img);
  }else{
    const box=document.createElement("div");box.className="preview-placeholder";box.innerHTML=`<div>📄</div><h3>Preview not available</h3><p>This file type cannot be previewed directly in the browser.</p><p>Use Download or Open Tab to access the original file.</p>`;previewBody.append(box);
  }
  previewModal.classList.add("show");
}
function closePreview(){previewModal.classList.remove("show");previewBody.replaceChildren();if(currentPreview){URL.revokeObjectURL(currentPreview.url);currentPreview=null}}
async function downloadFile(upload){
  const file=await getFile(upload.id);if(!file){alert("Original file is unavailable.");return}
  const url=URL.createObjectURL(file),a=document.createElement("a");a.href=url;a.download=upload.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
}

pickFilesBtn.onclick=()=>fileInput.click();
fileInput.onchange=e=>{addFiles(e.target.files);fileInput.value=""};
["dragenter","dragover"].forEach(n=>dropZone.addEventListener(n,e=>{e.preventDefault();dropZone.classList.add("drag-over")}));
["dragleave","drop"].forEach(n=>dropZone.addEventListener(n,e=>{e.preventDefault();dropZone.classList.remove("drag-over")}));
dropZone.addEventListener("drop",e=>addFiles(e.dataTransfer.files));

document.querySelectorAll(".folder-button").forEach(b=>b.onclick=()=>{activeFilter=b.dataset.filter;document.querySelectorAll(".folder-button").forEach(x=>x.classList.remove("active"));b.classList.add("active");render()});
searchInput.oninput=render;
gridViewBtn.onclick=()=>{activeView="grid";gridViewBtn.classList.add("active");listViewBtn.classList.remove("active");render()};
listViewBtn.onclick=()=>{activeView="list";listViewBtn.classList.add("active");gridViewBtn.classList.remove("active");render()};

closeModalBtn.onclick=closePreview;previewModal.addEventListener("click",e=>{if(e.target===previewModal)closePreview()});
openTabBtn.onclick=()=>{if(currentPreview)window.open(currentPreview.url,"_blank")};
downloadPreviewBtn.onclick=()=>{if(currentPreview)downloadFile(currentPreview.upload)};

exportBtn.onclick=()=>{const blob=new Blob([JSON.stringify(uploads,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="studydrop-documents.json";a.click();URL.revokeObjectURL(url)};
exportPdfBtn.onclick=()=>{
  if(!window.jspdf){alert("PDF library could not load.");return}
  const {jsPDF}=window.jspdf,doc=new jsPDF();doc.setFontSize(18);doc.text("StudyDrop Document Library",14,18);doc.setFontSize(10);let y=30;
  uploads.forEach((u,i)=>{const line=`${i+1}. ${u.name} | ${categoryLabels[u.category]} | ${u.subject} | ${formatBytes(u.size)}`;const lines=doc.splitTextToSize(line,180);if(y+lines.length*7>280){doc.addPage();y=20}doc.text(lines,14,y);y+=lines.length*7+5});
  doc.save("StudyDrop-Document-List.pdf");
};
clearBtn.onclick=async()=>{if(uploads.length&&confirm("Delete all saved documents permanently?")){await clearFiles();uploads=[];saveMeta();render()}};
render();