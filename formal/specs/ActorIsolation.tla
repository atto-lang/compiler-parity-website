------------------------- MODULE ActorIsolation -------------------------
EXTENDS Naturals, TLC

\* Finite bounded reference model. Actors A and B; one mutable slot.
\* Proving Inv here does NOT prove production runtime refinement.
CONSTANTS A, B
ASSUME A # B
Actors == {A, B}
Other(x) == IF x = A THEN B ELSE A
VARIABLES owner, reader, writer, epoch
vars == <<owner, reader, writer, epoch>>

Init == /\ owner = A
        /\ reader = "none"
        /\ writer = "none"
        /\ epoch = 0

AcquireRead == /\ reader = "none"
               /\ writer = "none"
               /\ reader' = owner
               /\ UNCHANGED <<owner, writer, epoch>>

ReleaseRead == /\ reader # "none"
               /\ reader' = "none"
               /\ UNCHANGED <<owner, writer, epoch>>

AcquireWrite == /\ writer = "none"
                /\ reader = "none"
                /\ writer' = owner
                /\ UNCHANGED <<owner, reader, epoch>>

ReleaseWrite == /\ writer # "none"
                /\ writer' = "none"
                /\ UNCHANGED <<owner, reader, epoch>>

Transfer == /\ epoch < 1
            /\ reader = "none"
            /\ writer = "none"
            /\ owner' = Other(owner)
            /\ epoch' = epoch + 1
            /\ UNCHANGED <<reader, writer>>

Next == AcquireRead \/ ReleaseRead \/ AcquireWrite \/ ReleaseWrite \/ Transfer
TypeOK == /\ owner \in Actors
          /\ reader \in Actors \cup {"none"}
          /\ writer \in Actors \cup {"none"}
          /\ epoch \in 0..1

NoAliasedWriter == ~(writer # "none" /\ reader # "none")
OwnerExclusive == /\ (writer = "none" \/ writer = owner)
                  /\ (reader = "none" \/ reader = owner)
Inv == TypeOK /\ NoAliasedWriter /\ OwnerExclusive
Spec == Init /\ [][Next]_vars
=============================================================================