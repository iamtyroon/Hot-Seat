# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Catch-All**: Any path not explicitly matched is denied for all reads and writes.
2. **Identity & Verified Email Invariant**: Every write operation requires `request.auth != null` and `request.auth.token.email_verified == true`.
3. **Owner-Only Profile & PII Isolation**:
   - `/users/{userId}` can only be read, created, or updated by `request.auth.uid == userId`.
   - `/users/{userId}/private/{docId}` isolates PII (`email`, `paypalEmail`) and is strictly restricted to `request.auth.uid == userId` AND `exists(/databases/$(database)/documents/users/$(userId))`.
4. **Relational Master Gate on Subcollections**:
   - `/users/{userId}/domains/{domainId}` requires the parent `/users/{userId}` document to exist (`exists(...)`) and `ownerId == request.auth.uid`.
5. **Temporal Integrity & Immutability**:
   - `createdAt` must equal `request.time` on `create` and is immutable on `update`.
   - `updatedAt` must equal `request.time` on `create` and `update`.
   - `uid` / `ownerId` are immutable after creation.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Write**: `auth = null` attempting `create` on `/users/u1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth = { uid: 'u1', token: { email_verified: false } }` attempting `create` on `/users/u1` -> `PERMISSION_DENIED`.
3. **Identity Spoofing on Profile**: `auth.uid = 'u1'` attempting `create` on `/users/u1` with `uid: 'u2'` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection on Profile Create**: Adding `"isAdmin": true` to `/users/u1` -> `PERMISSION_DENIED` (blocked by `hasOnly`).
5. **Shadow Field Injection on Profile Update**: Updating `/users/u1` with an undeclared field `"role": "admin"` -> `PERMISSION_DENIED`.
6. **Cross-User PII Read**: `auth.uid = 'attacker'` attempting `get` on `/users/victim/private/info` -> `PERMISSION_DENIED`.
7. **Orphaned Subcollection Write**: `auth.uid = 'u1'` attempting `create` on `/users/u1/private/info` when `/users/u1` does not exist -> `PERMISSION_DENIED`.
8. **Immutable Field Mutation**: `auth.uid = 'u1'` attempting to change `createdAt` or `uid` on `/users/u1` during `update` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: `auth.uid = 'u1'` sending a forged past/future `updatedAt` timestamp instead of `request.time` -> `PERMISSION_DENIED`.
10. **Oversized String / Resource Poisoning**: `displayName` exceeding 80 chars or `domain` exceeding 120 chars -> `PERMISSION_DENIED`.
11. **Invalid Enum Value**: Setting `provider: "github"` or `environment: "invalid"` -> `PERMISSION_DENIED`.
12. **Path Variable ID Poisoning**: Creating `/users/u1/domains/invalid$id!` with non-alphanumeric characters -> `PERMISSION_DENIED`.
