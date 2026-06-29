-- Migration 005: Supabase Storage bucket for meal photos
-- Creates the meal-photos bucket and RLS policies so each user can only
-- upload to their own folder (meal-photos/{user_id}/...) while all photos
-- are publicly readable via URL (needed to display them in the app).

insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', true)
on conflict (id) do nothing;

-- Users can upload photos only into their own subfolder
create policy "Users can upload their own meal photos"
on storage.objects for insert
with check (
  bucket_id = 'meal-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can update/replace their own photos
create policy "Users can update their own meal photos"
on storage.objects for update
using (
  bucket_id = 'meal-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own photos
create policy "Users can delete their own meal photos"
on storage.objects for delete
using (
  bucket_id = 'meal-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Anyone can read meal photos (public bucket — URL is the access control)
create policy "Meal photos are publicly readable"
on storage.objects for select
using (bucket_id = 'meal-photos');
