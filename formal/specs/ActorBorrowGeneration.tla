------------------------- MODULE ActorBorrowGeneration -------------------------
EXTENDS Naturals, TLC
\* Finite design model: two actors, two read slots, one writer, two epochs.
\* Reader generations track the borrow owner and forbid take with a live loan.
\* Not a compiler-backed guest or unbounded implementation-refinement proof.
CONSTANTS A, B
ASSUME A # B
Actors == {A, B}
Other(a) == IF a = A THEN B ELSE A

VARIABLES owner, epoch, readers, readerEpoch, writer, writerEpoch
vars == <<owner, epoch, readers, readerEpoch, writer, writerEpoch>>

Init == /\ owner = A
        /\ epoch = 0
        /\ readers = 0
        /\ readerEpoch = 0
        /\ writer = "none"
        /\ writerEpoch = 0

AcquireRead == /\ writer = "none"
               /\ readers < 2
               /\ readers' = readers + 1
               /\ readerEpoch' = epoch
               /\ UNCHANGED <<owner, epoch, writer, writerEpoch>>

ReleaseRead == /\ readers > 0
               /\ readers' = readers - 1
               /\ UNCHANGED <<owner, epoch, readerEpoch, writer, writerEpoch>>

AcquireWrite == /\ writer = "none"
                /\ readers = 0
                /\ writer' = owner
                /\ writerEpoch' = epoch
                /\ UNCHANGED <<owner, epoch, readers, readerEpoch>>

ReleaseWrite == /\ writer # "none"
                /\ writer' = "none"
                /\ UNCHANGED <<owner, epoch, readers, readerEpoch, writerEpoch>>

TakeOwner == /\ epoch < 1
             /\ readers = 0
             /\ writer = "none"
             /\ owner' = Other(owner)
             /\ epoch' = epoch + 1
             /\ UNCHANGED <<readers, readerEpoch, writer, writerEpoch>>

\* Three deliberately unsafe actions, enabled only in separate mutant specs.
MutantOverlapWrite == /\ writer = "none"
                      /\ readers > 0
                      /\ writer' = owner
                      /\ writerEpoch' = epoch
                      /\ UNCHANGED <<owner, epoch, readers, readerEpoch>>

MutantStaleWriter == /\ epoch = 1
                     /\ writer = "none"
                     /\ writer' = A
                     /\ writerEpoch' = 0
                     /\ UNCHANGED <<owner, epoch, readers, readerEpoch>>

MutantTakeWithRead == /\ epoch = 0
                      /\ readers > 0
                      /\ writer = "none"
                      /\ owner' = B
                      /\ epoch' = epoch + 1
                      /\ UNCHANGED <<readers, readerEpoch, writer, writerEpoch>>

Next == AcquireRead \/ ReleaseRead \/ AcquireWrite \/ ReleaseWrite \/ TakeOwner
MutantOverlapNext == Next \/ MutantOverlapWrite
MutantStaleNext == Next \/ MutantStaleWriter
MutantReadTransferNext == Next \/ MutantTakeWithRead

TypeOK == /\ owner \in Actors
          /\ epoch \in 0..1
          /\ readers \in 0..2
          /\ readerEpoch \in 0..1
          /\ writer \in Actors \cup {"none"}
          /\ writerEpoch \in 0..1

NoReadWriteOverlap == writer = "none" \/ readers = 0
OwnerExclusive == writer = "none" \/ writer = owner
NoOldWriter == writer = "none" \/ writerEpoch = epoch
NoOldReader == readers = 0 \/ readerEpoch = epoch
Inv == TypeOK /\ NoReadWriteOverlap /\ OwnerExclusive /\ NoOldWriter /\ NoOldReader

Spec == Init /\ [][Next]_vars
MutantOverlapSpec == Init /\ [][MutantOverlapNext]_vars
MutantStaleSpec == Init /\ [][MutantStaleNext]_vars
MutantReadTransferSpec == Init /\ [][MutantReadTransferNext]_vars
=============================================================================