import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { EnrolStudent } from '@/components/EnrolStudent';
import { enrolmentsQuery, libraryQuery } from '@/lib/onboarding-queries';
export const Route = createFileRoute('/students/enrol')({
 loader: ({context})=>Promise.all([context.queryClient.ensureQueryData(enrolmentsQuery()),context.queryClient.ensureQueryData(libraryQuery())]),
 head:()=>({meta:[{title:'Enrol a student — Opus'},{name:'description',content:'Intake, welcome lesson and agreed piano practice goals.'},{property:'og:title',content:'Enrol a student — Opus'},{property:'og:description',content:'Intake, welcome lesson and agreed piano practice goals.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),component:EnrolPage,
});
function EnrolPage(){const navigate=useNavigate();return <EnrolStudent onClose={()=>void navigate({to:'/students'})}/>;}
