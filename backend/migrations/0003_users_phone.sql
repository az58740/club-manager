-- The mobile number is contact information, never a sign-in identifier. It was
-- kept on the device while accounts lived in the browser; now that the server
-- owns the account it has to own the number too, or a club would lose it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32);