import { ProSheet } from './ProSheet';
import { useState, useRef } from 'react';
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Check, Plus, Video, Play, Mic, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getAssignmentEditor, saveAssignment, makeAsyncLesson, getParentAssignments, completeParentTask, setParentMediaConsent, submitRecording, approveSubmission, getReviewQueue, reviewSubmission, getAssignmentSettings, setAssignmentSettings, requestParentVideoLesson } from '@/services/assignments';
import { PHONE_MEDIA_ACCEPT, describeUnsupportedMedia, isPhoneMediaFile, mediaKindFromFile } from '@/lib/media-accept';
import { toast } from 'sonner';
import type { AssignmentTask, Feedback } from '@/mocks/types';
import { intakeField } from './StudentIntake';
import { useParentLanguage } from '@/i18n/parent';
import { addDays } from '@/lib/calendar';
export const assignmentSettingsQuery=queryOptions({queryKey:['assignment-settings'],queryFn:getAssignmentSettings});
const parentTasksQuery=queryOptions({queryKey:['parent','assignments'],queryFn:getParentAssignments});
const editorQuery=(id:string)=>queryOptions({queryKey:['assignment-editor',id],queryFn:()=>getAssignmentEditor(id)});
const reviewQuery=queryOptions({queryKey:['review-queue'],queryFn:getReviewQueue});
function useRefreshAssignments(){const client=useQueryClient();return ()=>Promise.all(['parent','review-queue','assignment-editor','day','week','credits','live-lesson','student-profile','chat-threads','messages','assignment-settings','studio-settings'].map(key=>client.invalidateQueries({queryKey:[key]})));}
export { ProSheet } from './ProSheet';
export function AssignmentSettings(){const {data}=useSuspenseQuery(assignmentSettingsQuery);const refresh=useRefreshAssignments();const change=useMutation({mutationFn:setAssignmentSettings,onSuccess:refresh});return <section className="border-y border-border py-6"><h2 className="text-2xl font-semibold">Video lesson policy</h2><label className="mt-5 block font-semibold">When a lesson is by video<select className={intakeField} value={data.asyncLessonPolicy} onChange={event=>change.mutate({...data,asyncLessonPolicy:event.target.value==='makeup_credit'?'makeup_credit':'counts_as_lesson'})}><option value="makeup_credit">Earn a make-up credit</option><option value="counts_as_lesson">Counts as the lesson — no credit</option></select></label></section>;}
export function AssignmentEditor({occurrenceId,videoMode=false}:{occurrenceId:string;videoMode?:boolean}){const {data}=useSuspenseQuery(editorQuery(occurrenceId));return <TaskEditor key={occurrenceId} data={data} videoMode={videoMode}/>;}
function TaskEditor({data,videoMode}:{data:Awaited<ReturnType<typeof getAssignmentEditor>>;videoMode:boolean}){
 const [tasks,setTasks]=useState<AssignmentTask[]>([]);const [dueDate,setDueDate]=useState(addDays(data.lesson.startsAt.slice(0,10),6));const [demoClip,setDemoClip]=useState(false);const [pro,setPro]=useState(false);const refresh=useRefreshAssignments();
 const previous=data.history.find(entry=>entry.occurrenceId!==data.lesson.id)??data.history[0];
 const copyTasks=(unfinished:boolean)=>setTasks((previous?.tasks??[]).filter(task=>!unfinished||!task.done).map(task=>({...task,id:crypto.randomUUID(),done:false})));
 const save=useMutation({mutationFn:async()=>{const result=await saveAssignment({studentId:data.lesson.studentId,occurrenceId:data.lesson.id,dueDate,tasks,demoClip});if(videoMode)await makeAsyncLesson(data.lesson.id);return result;},onSuccess:refresh});
 const update=(id:string,patch:Partial<AssignmentTask>)=>setTasks(tasks.map(task=>task.id===id?{...task,...patch}:task));
 const total=tasks.reduce((sum,task)=>sum+task.minutesPerDay*task.daysPerWeek,0);const sameDays=tasks.length>0&&tasks.every(task=>task.daysPerWeek===tasks[0]?.daysPerWeek);
 return <section className="border-y border-border py-6"><h2 className="text-2xl font-semibold">{videoMode?'Set recording tasks':'Set next week'}</h2><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" disabled={!previous} onClick={()=>copyTasks(false)}>Repeat last week</Button><Button variant="outline" disabled={!previous} onClick={()=>copyTasks(true)}>Carry over unfinished</Button></div><label className="mt-5 block font-semibold">Add from course<select className={intakeField} value="" onChange={event=>{const item=data.course.items.find(item=>item.id===event.target.value);if(item)setTasks([...tasks,{id:crypto.randomUUID(),courseItemId:item.id,text:`Explore ${item.title}`,minutesPerDay:10,daysPerWeek:5,submissionRequested:videoMode?'video':'none',done:false}]);}}><option value="">Pick a course item</option>{data.course.items.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label><Button className="mt-3" variant="ghost" onClick={()=>setTasks([...tasks,{id:crypto.randomUUID(),text:'',minutesPerDay:10,daysPerWeek:5,submissionRequested:'none',done:false}])}><Plus aria-hidden/>Add task</Button>
 {tasks.map(task=><fieldset key={task.id} className="mt-5 min-w-0 border-t border-border pt-4"><label className="block font-semibold">Task<Input className={intakeField} value={task.text} onChange={event=>update(task.id,{text:event.target.value})}/></label><div className="mt-3 grid gap-4 sm:grid-cols-2"><label>Minutes per day<Input className={intakeField} type="number" min={1} max={240} value={task.minutesPerDay} onChange={event=>update(task.id,{minutesPerDay:Number(event.target.value)})}/></label><label>Days per week<Input className={intakeField} type="number" min={1} max={7} value={task.daysPerWeek} onChange={event=>update(task.id,{daysPerWeek:Number(event.target.value)})}/></label></div><label className="mt-3 block">Attach from Library<select className={intakeField} value={task.contentItemId??''} onChange={event=>update(task.id,{contentItemId:event.target.value||undefined})}><option value="">No attachment</option>{data.attachable.map(item=><option key={item.id} value={item.id}>{item.title} · {item.kind==='video_link'?'video link':item.kind}</option>)}</select></label><label className="mt-3 block">Ask for a recording {data.settings.plan==='base'&&<span className="text-muted-foreground">· Pro</span>}<select className={intakeField} value={task.submissionRequested} onChange={event=>{if(data.settings.plan==='base'&&event.target.value!=='none'){setPro(true);return;}update(task.id,{submissionRequested:event.target.value as AssignmentTask['submissionRequested']});}}><option value="none">None</option><option value="audio">Audio</option><option value="video">Video</option></select></label><Button variant="ghost" onClick={()=>setTasks(tasks.filter(entry=>entry.id!==task.id))}><Trash2 aria-hidden/>Remove task</Button></fieldset>)}
 <p className="mt-5 text-xl font-semibold">{sameDays?`${tasks[0]?.daysPerWeek} days × ${tasks.reduce((sum,task)=>sum+task.minutesPerDay,0)} min = `:''}{total} min · Practice goal {data.course.course.weeklyPracticeGoalMin} min</p><label className="mt-4 block">Due date<Input className={intakeField} type="date" value={dueDate} onChange={event=>setDueDate(event.target.value)}/></label>{videoMode&&<label className="mt-4 flex min-h-12 items-center gap-3"><input className="size-6 accent-primary" type="checkbox" checked={demoClip} onChange={event=>setDemoClip(event.target.checked)}/>Attach demo clip placeholder</label>}<Button className="mt-5 w-full" disabled={save.isPending||!tasks.length} onClick={()=>save.mutate()}>{videoMode?'Confirm video lesson':'Send assignment'}</Button>{save.isSuccess&&<p role="status" className="mt-3 text-success">{videoMode?'Video lesson saved — family notified.':'Assignment sent to family chat.'}</p>}{save.error&&<p role="alert" className="mt-3 text-destructive">{save.error.message}</p>}<ProSheet open={pro} close={()=>setPro(false)}/></section>;
}
export function VideoLessonButton({occurrenceId,async=false}:{occurrenceId:string;async?:boolean}){const {data}=useSuspenseQuery(assignmentSettingsQuery);const [open,setOpen]=useState(false);const [pro,setPro]=useState(false);return <><Button className="mt-4" variant="outline" onClick={()=>data.plan==='base'?setPro(true):setOpen(true)}><Video aria-hidden/>{async?'Video lesson':'Make this a video lesson'}{data.plan==='base'&&' · Pro'}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Video lesson</DialogTitle></DialogHeader><AssignmentEditor occurrenceId={occurrenceId} videoMode/></DialogContent></Dialog><ProSheet open={pro} close={()=>setPro(false)}/></>;}
export function ParentAssignments() {
  const { data } = useSuspenseQuery(parentTasksQuery);
  const { lang } = useParentLanguage();
  const zh = lang === "zh-CN";
  const viet = lang === "vi";
  const refresh = useRefreshAssignments();
  const [minutesTask, setMinutesTask] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(15);
  const [recordTask, setRecordTask] = useState<string | null>(null);
  const [studentAuthor, setStudentAuthor] = useState(false);
  const [tipRead, setTipRead] = useState(false);
  const [pro, setPro] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [upload, setUpload] = useState<{
    fileName: string;
    mediaUrl: string;
    mimeType?: string;
    durationSec?: number;
    kind: "audio" | "video";
    previewKind: "image" | "video";
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const mark = useMutation({
    mutationFn: () => {
      if (!minutesTask) throw new Error("Choose a task.");
      return completeParentTask(minutesTask, minutes);
    },
    onSuccess: async () => {
      setMinutesTask(null);
      await refresh();
    },
  });
  const record = useMutation({
    mutationFn: () => {
      if (!recordTask) throw new Error("Choose a task.");
      if (!upload) throw new Error(zh ? "请从手机相册选择视频或照片。" : viet ? "Chọn video hoặc ảnh từ thư viện điện thoại." : "Choose a video or photo from the phone gallery.");
      const { previewKind: _previewKind, ...media } = upload;
      void _previewKind;
      return submitRecording(recordTask, studentAuthor ? "student" : "guardian", media);
    },
    onSuccess: async () => {
      setUpload(null);
      await refresh();
    },
  });
  const consent = useMutation({ mutationFn: () => setParentMediaConsent(true), onSuccess: refresh });
  const approve = useMutation({ mutationFn: approveSubmission, onSuccess: refresh });
  const sick = useMutation({ mutationFn: requestParentVideoLesson, onSuccess: refresh });

  async function onPickMedia(file?: File) {
    if (!file) return;
    if (!isPhoneMediaFile(file)) {
      toast.error(describeUnsupportedMedia(file, lang));
      return;
    }
    const kind = mediaKindFromFile(file);
    if (!kind) {
      toast.error(describeUnsupportedMedia(file, lang));
      return;
    }
    const mediaUrl = URL.createObjectURL(file);
    let durationSec: number | undefined;
    if (kind === "video") {
      durationSec = await new Promise<number | undefined>((resolve) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.src = mediaUrl;
        const timer = window.setTimeout(() => resolve(20), 3000);
        video.onloadedmetadata = () => {
          window.clearTimeout(timer);
          resolve(Number.isFinite(video.duration) ? Math.round(video.duration) : 20);
        };
        video.onerror = () => {
          window.clearTimeout(timer);
          resolve(20);
        };
      });
    }
    setUpload({
      fileName: file.name,
      mediaUrl,
      ...(file.type ? { mimeType: file.type } : {}),
      // Assignment submissions are audio/video; phone photos (HEIC etc.) are stored as video-kind media with the original file.
      kind: kind === "image" ? "video" : kind,
      durationSec: kind === "image" ? 0 : durationSec ?? 20,
      previewKind: kind,
    });
  }

  return <section className="mt-6 border-y border-border py-6"><h2 className="text-2xl font-semibold">{zh?'本周' : viet ? 'Tuần này':'This week'}</h2>{data.assignments.length===0&&<p className="mt-3">{zh?'暂无作业' : viet ? 'Chưa có bài tập.':'No assignments yet.'}</p>}{data.assignments.map(assignment=><div className="mt-5 border-b border-border pb-5" key={assignment.id}><h3 className="text-xl font-semibold">{data.children.find(child=>child.id===assignment.studentId)?.firstName} · {zh?'截止' : viet ? 'Hạn':'Due'} {assignment.dueDate}</h3>{assignment.tasks.map(task=><div key={task.id} className="mt-4"><label className="flex min-h-12 cursor-pointer items-center gap-3"><input className="size-7 shrink-0 accent-primary" type="checkbox" checked={task.done} disabled={task.done} onChange={()=>{setMinutesTask(task.id);mark.reset();}}/><span className="break-words font-semibold">{task.text}</span></label><p className="ml-10 text-muted-foreground">{task.daysPerWeek} × {task.minutesPerDay} {zh?'分钟' : viet ? 'phút':'min'}</p>{task.contentItemId&&(()=>{const attachment=data.attachments.find(item=>item.id===task.contentItemId);if(!attachment)return null;return <p className="ml-10 mt-1 break-words" data-testid="task-attachment">{zh?'附件：' : viet ? 'Đã đính kèm: ':'Attached: '}{attachment.url?<a className="text-primary underline" href={attachment.url} target="_blank" rel="noreferrer">{attachment.title}</a>:<span className="font-semibold">{attachment.title}</span>}</p>;})()}{task.submissionRequested!=='none'&&<Button className="mt-2" variant="outline" onClick={()=>{if(!data.pro){setPro(true);return;}record.reset();setRecordTask(task.id);}}><Video aria-hidden/>{zh?'录制' : viet ? 'Ghi hình':'Record'} {task.submissionRequested}{!data.pro&&' · Pro'}</Button>}{data.submissions.filter(entry=>entry.assignmentTaskId===task.id).map(entry=><div className="mt-3 border-l-2 border-border pl-4" key={entry.id}><p>0:20 · {entry.kind} · {entry.status==='reviewed'?(zh?'反馈已就绪' : viet ? 'Đã có nhận xét':'Feedback ready'):entry.guardianApproved?(zh?'等待老师审核' : viet ? 'Đang chờ giáo viên duyệt':'Waiting for teacher review'):(zh?'等待家长批准' : viet ? 'Đang chờ phụ huynh duyệt':'Waiting for guardian approval')}</p>{!entry.guardianApproved&&<Button className="mt-2" variant="outline" onClick={()=>approve.mutate(entry.id)}>{zh?'家长批准' : viet ? 'Duyệt với tư cách phụ huynh':'Approve as guardian'}</Button>}{entry.comment&&<p className="mt-2">{entry.comment}</p>}</div>)}</div>)}{assignment.demoClip&&<p className="mt-3">▶ 0:20 · Teacher demo clip placeholder</p>}<Button className="mt-4" variant="ghost" onClick={()=>data.pro?sick.mutate(assignment.studentId):setPro(true)}>{zh?'生病了？发送视频代替' : viet ? 'Con bị ốm? Gửi video thay thế':'Child sick? Send a video instead'}{!data.pro&&' · Pro'}</Button></div>)}{sick.isSuccess&&<p className="mt-3 text-success">{zh?'请求已发送给老师' : viet ? 'Đã gửi yêu cầu cho giáo viên.':'Request sent to your teacher.'}</p>}
 <Dialog open={Boolean(minutesTask)} onOpenChange={()=>setMinutesTask(null)}><DialogContent><DialogHeader><DialogTitle>{zh?'练习分钟数' : viet ? 'Số phút luyện tập':'Practice minutes'}</DialogTitle></DialogHeader><label>{zh?'分钟' : viet ? 'Số phút':'Minutes'}<Input className={intakeField} type="number" min={1} value={minutes} onChange={event=>setMinutes(Number(event.target.value))}/></label><Button disabled={mark.isPending} onClick={()=>mark.mutate()}><Check aria-hidden/>{zh?'保存练习' : viet ? 'Lưu luyện tập':'Save practice'}</Button>{mark.error&&<p role="alert">{mark.error.message}</p>}</DialogContent></Dialog>
 <Dialog open={Boolean(recordTask)} onOpenChange={(open) => { if (!open) { setRecordTask(null); setUpload(null); setTipRead(false); } }}>
 <DialogContent>
 <DialogHeader><DialogTitle>{zh ? '提交录制' : viet ? 'Gửi bản ghi' : 'Submit recording'}</DialogTitle></DialogHeader>
 {!data.mediaConsent ? <>
   <p>{zh ? '家长同意后才能录制。只拍手和琴键，不需要脸部或校服。' : viet ? 'Cần phụ huynh đồng ý trước khi ghi hình. Chỉ quay tay và phím đàn; không cần quay mặt hay đồng phục học sinh.' : 'Guardian consent is needed before recording. Film hands and keys only; faces and school uniforms aren’t needed.'}</p>
   <label className="flex min-h-12 items-center gap-3"><input className="size-6 accent-primary" type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} />{zh ? '我是家长，同意分享练习媒体' : viet ? 'Tôi là phụ huynh và đồng ý chia sẻ video/ảnh luyện tập' : 'I am the guardian and consent to sharing practice media'}</label>
   <Button disabled={!consentChecked || consent.isPending} onClick={() => consent.mutate()}>{zh ? '同意' : viet ? 'Đồng ý' : 'Give consent'}</Button>
 </> : !tipRead ? <>
   <p>{zh ? '只拍手和琴键，不需要脸部或校服。' : viet ? 'Chỉ quay tay và phím đàn. Không cần quay mặt hay đồng phục học sinh.' : 'Film hands and keys only. Faces and school uniforms aren’t needed.'}</p>
   <Button onClick={() => setTipRead(true)}>{zh ? '知道了' : viet ? 'Đã hiểu' : 'Got it'}</Button>
 </> : <div className="space-y-4">
   <div className="flex min-h-40 flex-col items-center justify-center border border-border bg-muted p-4 text-center">
     {upload ? (upload.previewKind === 'video' ? <video src={upload.mediaUrl} controls playsInline className="max-h-48 max-w-full" /> : <img src={upload.mediaUrl} alt={upload.fileName} className="max-h-48 max-w-full object-contain" />) : <>
       <Video aria-hidden className="size-10 text-primary" />
       <p className="mt-3">{zh ? '从手机相册上传视频或照片（含 HEIC / MOV）' : viet ? 'Tải lên video hoặc ảnh từ điện thoại (HEIC, MOV, MP4)' : 'Upload a phone video or photo (HEIC, MOV, MP4)'}</p>
     </>}
   </div>
   <input ref={fileInput} type="file" accept={PHONE_MEDIA_ACCEPT} capture="environment" className="hidden" aria-label={zh ? '选择手机媒体' : viet ? 'Chọn tệp từ điện thoại' : 'Choose phone media'} onChange={(event) => { void onPickMedia(event.target.files?.[0]); event.target.value = ''; }} />
   <div className="flex flex-wrap gap-2">
     <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>{zh ? '从相册选择' : viet ? 'Chọn từ thư viện' : 'Choose from gallery'}</Button>
     {upload && <Button type="button" variant="ghost" onClick={() => { URL.revokeObjectURL(upload.mediaUrl); setUpload(null); }}>{zh ? '清除' : viet ? 'Xóa' : 'Clear'}</Button>}
   </div>
   {upload && <p className="break-all text-base text-muted-foreground">{upload.fileName}</p>}
   <label className="flex min-h-12 items-center gap-3"><input className="size-6 accent-primary" type="checkbox" checked={studentAuthor} onChange={(event) => setStudentAuthor(event.target.checked)} />{zh ? '以学生身份提交' : viet ? 'Gửi với tư cách học sinh' : 'Submit as student'}</label>
   <Button disabled={!upload || record.isPending || record.isSuccess} onClick={() => record.mutate()}>{zh ? '提交媒体' : viet ? 'Gửi tệp' : 'Submit media'}</Button>
   {record.isSuccess && <p role="status" className="text-success">{record.data.guardianApproved ? (zh ? '已提交审核' : viet ? 'Đã gửi để duyệt' : 'Submitted for review') : (zh ? '等待家长批准' : viet ? 'Đang chờ phụ huynh duyệt' : 'Waiting for guardian approval')}</p>}
 </div>}
 {record.error && <p role="alert">{record.error.message}</p>}
 </DialogContent>
 </Dialog><ProSheet open={pro} close={()=>setPro(false)}/></section>;
}
export function ReviewQueue(){const {data}=useSuspenseQuery(assignmentSettingsQuery);const [open,setOpen]=useState(false);const [pro,setPro]=useState(false);return <><div className="mb-6 border-y border-border py-4">{data.plan==='base'?<Button variant="outline" onClick={()=>setPro(true)}>To review · Pro</Button>:<ReviewCount open={()=>setOpen(true)}/>}</div><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>To review</DialogTitle></DialogHeader>{open&&<ReviewList/>}</DialogContent></Dialog><ProSheet open={pro} close={()=>setPro(false)}/></>;}
function ReviewCount({open}:{open:()=>void}){const {data}=useSuspenseQuery(reviewQuery);return <Button variant="outline" onClick={open}>To review · {data.length}</Button>;}
function ReviewList(){const {data}=useSuspenseQuery(reviewQuery);const [selected,setSelected]=useState<string|null>(null);const [outcome,setOutcome]=useState<Feedback['outcome']>('pass');const [stage,setStage]=useState<1|2|3|4|5>(3);const [comment,setComment]=useState('');const [reply,setReply]=useState<'none'|'voice'|'video'>('none');const refresh=useRefreshAssignments();const review=useMutation({mutationFn:()=>{if(!selected)throw new Error('Choose a submission.');return reviewSubmission(selected,{outcome,newStage:stage,comment,...(reply==='none'?{}:{replyKind:reply})});},onSuccess:async()=>{setSelected(null);await refresh();}});const entry=data.find(item=>item.id===selected);return <div>{data.length===0&&<p>No recordings waiting.</p>}{data.map(item=><Button key={item.id} variant="ghost" className="my-2 h-auto w-full justify-start whitespace-normal border-b border-border py-4 text-left" onClick={()=>{setSelected(item.id);setComment('');review.reset();}}>{item.studentName} · {item.task?.text} · {item.daysWaiting} days waiting</Button>)}{entry&&<section className="mt-5 space-y-4"><div className="flex min-h-40 flex-col items-center justify-center bg-muted"><Play aria-hidden className="size-10"/><p className="mt-3">0:20 · {entry.kind} player placeholder</p></div><label className="block">Checkpoint<select className={intakeField} value={outcome} onChange={event=>setOutcome(event.target.value as Feedback['outcome'])}><option value="pass">Pass checkpoint</option><option value="stage_move">Move to stage</option><option value="carry_over">Carry over</option><option value="needs_work">Needs work</option></select></label>{outcome==='stage_move'&&<label className="block">Stage<select className={intakeField} value={stage} onChange={event=>setStage(Number(event.target.value) as 1|2|3|4|5)}>{[1,2,3,4,5].map(value=><option key={value}>{value}</option>)}</select></label>}<label className="block">Shared comment<textarea className={intakeField} rows={3} value={comment} onChange={event=>setComment(event.target.value)}/></label><label className="block">Reply with voice or video<select className={intakeField} value={reply} onChange={event=>setReply(event.target.value as 'none'|'voice'|'video')}><option value="none">Text only</option><option value="voice">Voice placeholder</option><option value="video">Video placeholder</option></select></label><Button disabled={review.isPending} onClick={()=>review.mutate()}><Mic aria-hidden/>Review and send feedback</Button>{review.error&&<p role="alert">{review.error.message}</p>}</section>}</div>;}
