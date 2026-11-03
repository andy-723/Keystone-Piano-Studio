import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Library } from '@/components/Library';
import { libraryQuery } from '@/lib/onboarding-queries';
export const Route=createFileRoute('/library')({loader:({context})=>context.queryClient.ensureQueryData(libraryQuery()),head:()=>({meta:[{title:'Lesson library — Opus'},{name:'description',content:'Reusable piano content, welcome lessons and studio course templates.'},{property:'og:title',content:'Lesson library — Opus'},{property:'og:description',content:'Reusable piano content, welcome lessons and studio course templates.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),component:()=> <><Button asChild variant="ghost" className="mb-5"><Link to="/settings"><ArrowLeft aria-hidden/>Settings</Link></Button><Library/></>});
