-- Migration 011: make meal photos private
-- The meal-photos bucket was public-read (migration 005) with the URL as the
-- only access control — anyone holding a URL could view any user's meal photo
-- forever. For a health app that's the wrong default. From now on the bucket
-- is private: meal_logs.photo_url stores the storage PATH ({user_id}/{uuid}.jpg)
-- and readers exchange it for a short-lived signed URL.

-- 1. Flip the bucket private.
update storage.buckets set public = false where id = 'meal-photos';

-- 2. Replace the public-read policy with per-user read (same folder rule the
--    write policies already use).
drop policy if exists "Meal photos are publicly readable" on storage.objects;

create policy "Users can read their own meal photos"
on storage.objects for select
using (
  bucket_id = 'meal-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 3. Convert legacy rows: full public URLs → bare storage paths.
--    https://<ref>.supabase.co/storage/v1/object/public/meal-photos/{uid}/{f}.jpg
--    becomes {uid}/{f}.jpg
update public.meal_logs
set photo_url = regexp_replace(photo_url, '^.*/object/public/meal-photos/', '')
where photo_url like 'http%/object/public/meal-photos/%';
