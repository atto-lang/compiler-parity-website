------------------------- MODULE CancellationAwait ---------------------
EXTENDS Naturals, TLC

\* Cancellation is explicit and the waiter retains an enabled wakeup.
\* Progress is conditional on WF_vars(Wake); no unbounded guest proof.
VARIABLES cancelled, waiting, released, charged, completions
vars == <<cancelled, waiting, released, charged, completions>>

Init == /\ cancelled = FALSE
        /\ waiting = TRUE
        /\ released = FALSE
        /\ charged = 1
        /\ completions = 0

RequestCancel == /\ waiting
                 /\ ~cancelled
                 /\ cancelled' = TRUE
                 /\ UNCHANGED <<waiting, released, charged, completions>>

Wake == /\ waiting
        /\ cancelled
        /\ waiting' = FALSE
        /\ released' = TRUE
        /\ charged' = 0
        /\ completions' = 1
        /\ UNCHANGED cancelled

Timeout == /\ waiting
           /\ ~cancelled
           /\ waiting' = FALSE
           /\ released' = TRUE
           /\ charged' = 0
           /\ completions' = 1
           /\ UNCHANGED cancelled

Next == RequestCancel \/ Wake \/ Timeout
TypeOK == /\ cancelled \in BOOLEAN
          /\ waiting \in BOOLEAN
          /\ released \in BOOLEAN
          /\ charged \in 0..1
          /\ completions \in 0..1
SafeCleanup == released => (~waiting /\ charged = 0)
WakeEnabled == (cancelled /\ waiting) => ENABLED Wake
Inv == TypeOK /\ SafeCleanup /\ WakeEnabled
Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ WF_vars(Wake)
=============================================================================