-- Rollback for 0029_trusted_devices. Every trusted browser goes back to the 8-hour limit.
drop table if exists public.trusted_device;
notify pgrst, 'reload schema';
