-- Auto-confirm email ONLY for workout-app signups (user_metadata.app = 'w20fit').
-- Applied to the shared project cpvzwqptzcxnwzfzgrmt.
--
-- The workout app can't rely on the project-level "Confirm email" dashboard toggle
-- (it also governs my20fit and every other app on this shared project). This scoped
-- trigger auto-confirms only users the workout app marks with app='w20fit', leaving
-- all other apps' confirmation behavior untouched. Combined with the app signing in
-- immediately after signup, workout users get in without an email verification step.
--
-- Trade-off (accepted by product): workout signups are not email-verified, so someone
-- can register with an address they don't own.

create or replace function public.w20fit_autoconfirm_email()
returns trigger language plpgsql as $$
begin
  if (new.raw_user_meta_data ->> 'app') = 'w20fit' and new.email_confirmed_at is null then
    new.email_confirmed_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists w20fit_autoconfirm on auth.users;
create trigger w20fit_autoconfirm
  before insert on auth.users
  for each row execute function public.w20fit_autoconfirm_email();
