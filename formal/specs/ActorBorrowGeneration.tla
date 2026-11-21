------------------------- MODULE ActorBorrowGeneration -------------------------
EXTENDS Naturals, TLC
\* Finite model: two owners, two read slots, one writer, two generations.
\* This is a design safety model, not a compiled-guest or runtime refinement proof.
CONSTANTS A, B
ASSUME A # B
Actors == {A, B}
Other(a) == IF a = A THEN B ELSE A

VARIABLES owner, epoch, readers, writer, writerEpoch
vars == <<owner, epoch, readers, writer, writerEpoch>>

Init == /\ owner = A
        /\ epoch = 0
        /\ readers = 0
        /\ writer = "none"
        /\ writerEpoch = 0

AcquireRead == /\ writer = "none"
               /\ readers < 2
               /\ readers' = readers + 1
               /\ UNCHANGED <<owner, epoch, writer, writerEpoch>>

ReleaseRead == /\ readers > 0
               /\ readers' = readers - 1
               /\ UNCHANGED <<owner, epoch, writer, writerEpoch>>

AcquireWrite == /\ writer = "none"
                /\ readers = 0
                /\ writer' = owner
                /\ writerEpoch' = epoch
                /\ UNCHANGED <<owner, epoch, readers>>

ReleaseWrite == /\ writer # "none"
                /\ writer' = "none"
                /\ UNCHANGED <<owner, epoch, readers, writerEpoch>>

TakeOwner == /\ epoch < 1
             /\ readers = 0
             /\ writer = "none"
             /\ owner' = Other(owner)
             /\ epoch' = epoch + 1
             /\ UNCHANGED <<readers, writer, writerEpoch>>

\* Explicit unsafe actions for negative mutation configs ONLY.
MutantOverlapWrite == /\ writer = "none"
                      /\ readers > 0
                      /\ writer' = owner
                      /\ writerEpoch' = epoch
                      /\ UNCHANGED <<owner, epoch, readers>>

MutantStaleWriter == /\ epoch = 1
                     /\ writer = "none"
                     /\ writer' = A
                     /\ writerEpoch' = 0
                     /\ UNCHANGED <<owner, epoch, readers>>

Next == AcquireRead \/ ReleaseRead \/ AcquireWrite \/ ReleaseWrite \/ TakeOwner
MutantOverlapNext == Next \/ MutantOverlapWrite
MutantStaleNext == Next \/ MutantStaleWriter

TypeOK == /\ owner \in Actors
          /\ epoch \in 0..1
          /\ readers \in 0..2
          /\ writer \in Actors \cup {"none"}
          /\ writerEpoch \in 0..1

NoReadWriteOverlap == writer = "none" \/ readers = 0
OwnerExclusive == writer = "none" \/ writer = owner
NoOldWriter == writer = "none" \/ writerEpoch = epoch
Inv == TypeOK /\ NoReadWriteOverlap /\ OwnerExclusive /\ NoOldWriter

Spec == Init /\ [][Next]_vars
MutantOverlapSpec == Init /\ [][MutantOverlapNext]_vars
MutantStaleSpec == Init /\ [][MutantStaleNext]_vars
=============================================================================