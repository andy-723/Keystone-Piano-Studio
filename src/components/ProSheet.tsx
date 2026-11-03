import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
export function ProSheet({ open, close }: { open: boolean; close: () => void }) {
  return <Dialog open={open} onOpenChange={close}><DialogContent><DialogHeader><DialogTitle>Available on Pro</DialogTitle></DialogHeader><p>Pro is A$49 a month + GST.</p><p>Recordings, video lessons, the review queue, Red Risk, board rules and Xero sync are included.</p><Button asChild onClick={close}><Link to="/settings" hash="plan-and-billing">Plan and billing</Link></Button><Button variant="outline" onClick={close}>Close</Button></DialogContent></Dialog>;
}