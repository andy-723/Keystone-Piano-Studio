import { useState, useRef } from 'react';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { ArrowLeft, Eye, Send, Paperclip, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { NewsCard } from './NewsCard';
import { newsOptionsQuery, refreshNews } from '@/lib/news-queries';
import { saveAnnouncement, type AnnouncementInput } from '@/services/news';
import type { Announcement, NewsAttachment, NewsTag } from '@/mocks/news';
import type { CommunityScope } from '@/mocks/community';
import { toast } from 'sonner';

export function NewsComposer({scope,post,close}:{scope:CommunityScope;post?:Announcement;close:()=>void}) {
 const {data:options}=useSuspenseQuery(newsOptionsQuery(scope));
 const [title,setTitle]=useState(post?.title??''),[body,setBody]=useState(post?.body??''),[tag,setTag]=useState<NewsTag>(post?.tag??'news');
 const [kind,setKind]=useState<Announcement['audience']['kind']>(post?.audience.kind??(options.studioWide?'studio':'my_students'));
 const [groups,setGroups]=useState(post?.audience.groupIds??[]),[families,setFamilies]=useState(post?.audience.familyIds??[]);
 const [important,setImportant]=useState(post?.important??false),[pin,setPin]=useState(post?.pinnedUntil?.slice(0,10)??''),[event,setEvent]=useState(post?.eventDate?.slice(0,16)??''),[expiry,setExpiry]=useState(post?.expiresAt?.slice(0,10)??'');
 const [schedule,setSchedule]=useState(post?.status==='scheduled'),[publishAt,setPublishAt]=useState(post?.publishAt.slice(0,16)??'2026-11-09T09:00');
 const [attachments,setAttachments]=useState<NewsAttachment[]>(post?.attachments??[]),[preview,setPreview]=useState(false),[error,setError]=useState('');
 const input=useRef<HTMLInputElement>(null),client=useQueryClient();
 const values=(status:Announcement['status']):AnnouncementInput=>({title,body,tag,audience:{kind,...(kind==='groups'?{groupIds:groups}:{}),...(kind==='families'?{familyIds:families}:{})},important,attachments:attachments.map(a=>({...a,featuresStudentIds:a.featuresStudentIds.length>1?a.featuresStudentIds.filter(id=>id!=='choose'):a.featuresStudentIds})),status,publishAt:schedule?`${publishAt}:00+11:00`:post?.status==='published'?post.publishAt:options.now,...(pin?{pinnedUntil:`${pin}T23:59:59+11:00`}:{}),...(event?{eventDate:`${event}:00+11:00`}:{}),...(expiry?{expiresAt:`${expiry}T23:59:59+11:00`}:{})});
 const save=useMutation({mutationFn:(status:Announcement['status'])=>saveAnnouncement(values(status),scope,post?.id),onSuccess:async result=>{await refreshNews(client);toast.success(result.status==='draft'?'Draft saved':result.status==='scheduled'?'Post scheduled':'Post published');close();},onError:e=>setError(e.message)});
 const toggle=(list:string[],id:string)=>list.includes(id)?list.filter(v=>v!==id):[...list,id];
 function attach(file?:File){if(!file)return;if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(file.type)||file.size>5*1024*1024){setError('Choose a JPG, PNG, WebP photo or PDF under 5 MB.');return;}setAttachments([...attachments,{id:crypto.randomUUID(),kind:file.type==='application/pdf'?'pdf':'image',fileName:file.name,url:URL.createObjectURL(file),featuresStudentIds:[],photoAnswered:file.type==='application/pdf'}]);}
 return <div className="mx-auto max-w-3xl"><Button variant="ghost" onClick={close}><ArrowLeft aria-hidden/>Back to news</Button><h1 className="my-5 text-3xl font-semibold">{post?'Edit post':'New post'}</h1><form className="space-y-6" onSubmit={e=>{e.preventDefault();setError('');save.mutate(schedule?'scheduled':'published');}}>
 <label className="block font-semibold">Title<Input required value={title} onChange={e=>setTitle(e.target.value)}/></label>
 <label className="block font-semibold">Message<Textarea required className="min-h-48" value={body} onChange={e=>setBody(e.target.value)}/></label>
 <label className="block font-semibold">Tag<select value={tag} onChange={e=>setTag(e.target.value as NewsTag)} className="mt-2 min-h-12 w-full rounded-md border-2 border-input bg-card px-3">{['news','event','concert','exam','holiday','reminder'].map(v=><option key={v} value={v}>{v[0]?.toUpperCase()}{v.slice(1)}</option>)}</select></label>
 <label className="block font-semibold">Who sees this<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)} className="mt-2 min-h-12 w-full rounded-md border-2 border-input bg-card px-3">{options.studioWide&&<option value="studio">All families in the studio</option>}<option value="my_students">My students</option><option value="groups">Groups…</option><option value="families">Choose families…</option></select></label>
 {kind==='groups'&&<fieldset><legend className="font-semibold">Groups</legend>{options.groups.map(g=><label key={g.id} className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={groups.includes(g.id)} onChange={()=>setGroups(toggle(groups,g.id))}/>{g.name}</label>)}</fieldset>}
 {kind==='families'&&<fieldset><legend className="font-semibold">Families</legend>{options.families.map(f=><label key={f.id} className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={families.includes(f.id)} onChange={()=>setFamilies(toggle(families,f.id))}/>{f.name}</label>)}</fieldset>}
 <div><Button type="button" variant="outline" onClick={()=>input.current?.click()}><Paperclip aria-hidden/>Attach photo or PDF</Button><input ref={input} type="file" className="hidden" aria-label="Attach photo or PDF" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={e=>{attach(e.target.files?.[0]);e.target.value='';}}/>
 {attachments.map(a=><div key={a.id} className="my-4 border-y border-border py-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="break-all">{a.fileName}</span><Button type="button" variant="ghost" onClick={()=>setAttachments(attachments.filter(v=>v.id!==a.id))}><X aria-hidden/>Remove</Button></div>{a.kind==='image'&&<><label className="block font-semibold">Does this photo show a student?<select className="mt-2 min-h-12 w-full rounded-md border-2 border-input bg-card px-3" value={!a.photoAnswered?'':a.featuresStudentIds.length?'yes':'no'} onChange={e=>setAttachments(attachments.map(v=>v.id===a.id?{...v,photoAnswered:Boolean(e.target.value),featuresStudentIds:e.target.value==='yes'?['choose']:[]}:v))}><option value="">Choose…</option><option value="no">No</option><option value="yes">Yes</option></select></label>{a.featuresStudentIds.length>0&&<fieldset><legend className="mt-3 font-semibold">Students in this photo</legend>{options.students.map(s=><label className="flex min-h-12 items-center gap-3" key={s.id}><input type="checkbox" checked={a.featuresStudentIds.includes(s.id)} onChange={()=>setAttachments(attachments.map(v=>v.id===a.id?{...v,featuresStudentIds:toggle(v.featuresStudentIds.filter(id=>id!=='choose'),s.id).concat('choose')}:v))}/>{s.name}</label>)}</fieldset>}</>}</div>)}
 </div>
 <label className="flex min-h-12 items-center gap-3 font-semibold"><input type="checkbox" checked={important} onChange={e=>setImportant(e.target.checked)}/>Important: also send by email</label>
 <label className="block font-semibold">Pin to top until<Input type="date" value={pin} onChange={e=>setPin(e.target.value)}/></label>
 <label className="block font-semibold">Event date (optional)<Input type="datetime-local" value={event} onChange={e=>setEvent(e.target.value)}/></label>
 <label className="block font-semibold">Expires on (optional)<Input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label>
 <label className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={schedule} onChange={e=>setSchedule(e.target.checked)}/>Schedule for</label>{schedule&&<label className="block font-semibold">Date and time<Input required type="datetime-local" value={publishAt} onChange={e=>setPublishAt(e.target.value)}/></label>}
 {error&&<p role="alert" className="text-destructive">{error}</p>}
 <div className="flex flex-wrap gap-3 pb-8"><Button type="submit" disabled={save.isPending}><Send aria-hidden/>{schedule?'Schedule post':'Post now'}</Button><Button type="button" variant="outline" onClick={()=>{setError('');save.mutate('draft');}} disabled={save.isPending}><Save aria-hidden/>Save draft</Button><Button type="button" variant="outline" onClick={()=>setPreview(true)}><Eye aria-hidden/>Preview</Button></div>
 </form><Dialog open={preview} onOpenChange={setPreview}><DialogContent><DialogTitle>Family preview</DialogTitle><NewsCard now={options.now} post={{id:'preview',title,body,authorName:post?.authorName??'Ms Clarke',tag,publishAt:options.now,attachments,seen:false,acknowledged:false,pinned:Boolean(pin),...(event?{eventDate:`${event}:00+11:00`}:{})}}/></DialogContent></Dialog></div>;
}