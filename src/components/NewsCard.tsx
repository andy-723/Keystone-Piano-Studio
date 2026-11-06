import { useState } from 'react';
import { Check, CalendarPlus, MessageCircle, Languages, ChevronDown, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FamilyAnnouncement } from '@/services/news';
import { newsText } from '@/i18n/news';
import type { Lang } from '@/mocks/types';

export function calendarFile(post: Pick<FamilyAnnouncement,'id'|'title'|'body'|'eventDate'>) {
 if (!post.eventDate) return;
 const escape = (s:string)=>s.replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll(',','\\,').replaceAll(';','\\;');
 const date = (s:string)=>new Date(s).toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
 const text = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//KeyStone Piano Studios//Prototype events//EN','BEGIN:VEVENT',`UID:${post.id}@opus.prototype`,`DTSTAMP:${date(post.eventDate)}`,`DTSTART:${date(post.eventDate)}`,`SUMMARY:${escape(post.title)}`,`DESCRIPTION:${escape(post.body)}`,'END:VEVENT','END:VCALENDAR'].join('\r\n');
 const url=URL.createObjectURL(new Blob([text],{type:'text/calendar'})),a=document.createElement('a');a.href=url;a.download='keystone-event.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function MessageBody({body}:{body:string}) { return <>{body.split(/(https?:\/\/[^\s]+)/g).map((part,i)=>/^https?:\/\//.test(part)?<a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">{part}</a>:part)}</>; }
export function NewsCard({post,lang='en',now,onSeen,onAcknowledge,onMessage,teacherMeta,children}:{post:FamilyAnnouncement;lang?:Lang;now:string;onSeen?:()=>void;onAcknowledge?:()=>void;onMessage?:()=>void;teacherMeta?:string;children?:React.ReactNode}) {
 const [expanded,setExpanded]=useState(false),[timeOpen,setTimeOpen]=useState(false);
 const t=(key:Parameters<typeof newsText>[1])=>newsText(lang,key);
 const date=new Date(post.publishAt),days=Math.max(0,Math.floor((Date.parse(now)-date.getTime())/86400000));
 const exact=date.toLocaleString(lang==='en'?'en-AU':'zh-CN',{timeZone:'Australia/Melbourne',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
 return <article className={`min-w-0 rounded-md border p-4 sm:p-6 ${post.pinned?'border-primary bg-secondary/40':'border-border bg-card'}`} aria-label={post.title}>
  <div className="mb-3 flex flex-wrap items-center gap-2 text-base font-semibold">{post.pinned&&<span className="text-primary">{t('pinned')}</span>}{!teacherMeta&&!post.seen&&<span className="text-success">{t('new')}</span>}<span className="rounded border border-border px-2 py-1 text-muted-foreground">{t(post.tag)}</span>{post.editedAt&&<span className="text-muted-foreground">{t('edited')}</span>}</div>
  <div className="flex flex-wrap items-center gap-x-2 text-base text-muted-foreground"><span>{post.authorName}</span><Button variant="ghost" className="h-auto min-h-12 whitespace-normal px-1 text-left font-normal" title={exact} aria-expanded={timeOpen} onClick={()=>setTimeOpen(!timeOpen)}>{timeOpen?exact:days===0?t('today'):`${days} ${t('ago')}`}</Button></div>
  <h3 className="mt-2 break-words text-2xl font-semibold">{post.title}</h3>
  <p className={`mt-4 whitespace-pre-wrap break-words text-lg ${expanded?'':'line-clamp-3'}`}><MessageBody body={post.body}/></p>
  <Button variant="ghost" className="mt-2 px-0" onClick={()=>{setExpanded(!expanded);onSeen?.();}} aria-expanded={expanded}><ChevronDown aria-hidden/>{expanded?t('less'):t('readMore')}</Button>
  {post.attachments.length>0&&<div className="my-4 space-y-3">{post.attachments.map(a=><div key={a.id}>{a.kind==='image'&&a.url&&<img src={a.url} alt={a.fileName} className="mb-2 max-h-80 w-full rounded-md object-contain"/>}{a.url?<Button asChild variant="outline" className="h-auto max-w-full whitespace-normal"><a href={a.url} download={a.fileName}><Paperclip aria-hidden/><span className="break-all">{a.fileName}</span></a></Button>:<p className="break-all text-base">{a.fileName}</p>}</div>)}</div>}
  {post.eventDate&&<p className="my-3 text-base font-semibold">{new Date(post.eventDate).toLocaleString(lang==='en'?'en-AU':'zh-CN',{timeZone:'Australia/Melbourne',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</p>}
  {teacherMeta?<p className="mt-3 text-base text-muted-foreground">{teacherMeta}</p>:<div className="mt-4 flex flex-wrap gap-2"><Button variant={post.acknowledged?'secondary':'outline'} disabled={post.acknowledged||!onAcknowledge} onClick={onAcknowledge}><Check aria-hidden/>{post.acknowledged?t('acknowledged'):t('gotIt')}</Button><Button variant="outline" disabled={!onMessage} onClick={onMessage} className="h-auto whitespace-normal"><MessageCircle aria-hidden/>{t('message')}</Button>{post.eventDate&&<Button variant="outline" onClick={()=>calendarFile(post)} className="h-auto whitespace-normal"><CalendarPlus aria-hidden/>{t('calendar')}</Button>}<Button variant="ghost" disabled className="h-auto whitespace-normal"><Languages aria-hidden/>{t('translate')}</Button></div>}
  {children}
 </article>;
}