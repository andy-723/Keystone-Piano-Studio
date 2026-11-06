import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ParentLanguageProvider } from '@/i18n/parent';
import { ParentIntakes } from '@/components/StudentIntake';
import { parentIntakesQuery } from '@/lib/onboarding-queries';
export const Route=createFileRoute('/intake/$recordId')({loader:({context})=>context.queryClient.ensureQueryData(parentIntakesQuery),head:()=>({meta:[{title:'Family intake — KeyStone Piano Studios'},{name:'description',content:'Complete your family’s piano student intake.'},{property:'og:title',content:'Family intake — KeyStone Piano Studios'},{property:'og:description',content:'Complete your family’s piano student intake.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),component:IntakePage});
function IntakePage(){const {recordId}=Route.useParams(); const {data}=useSuspenseQuery(parentIntakesQuery);return data.some(entry=>entry.id===recordId)?<ParentLanguageProvider initial="en"><ParentIntakes recordId={recordId}/></ParentLanguageProvider>:<p>Intake not found for this family.</p>;}
