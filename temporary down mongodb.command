db.users.updateMany(
  { isEnabled: true },
  { $set: { isEnabled: false } }
)

if want to enable again:

db.users.updateMany(
  { isEnabled: false },
  { $set: { isEnabled: true } }
)

