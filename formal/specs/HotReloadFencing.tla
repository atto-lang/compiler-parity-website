------------------------- MODULE HotReloadFencing ---------------------
EXTENDS Naturals, TLC

\* Stable ActorRef indirection, two generations, one outstanding ticket.
VARIABLES active, phase, ticket, lastTicket, lastAt, rolledBack
vars == <<active, phase, ticket, lastTicket, lastAt, rolledBack>>

Init == /\ active = 1
        /\ phase = "live"
        /\ ticket = 0
        /\ lastTicket = 0
        /\ lastAt = 0
        /\ rolledBack = FALSE

Issue == /\ phase = "live"
         /\ ticket = 0
         /\ ticket' = active
         /\ UNCHANGED <<active, phase, lastTicket, lastAt, rolledBack>>

Execute == /\ phase = "live"
           /\ ticket = active
           /\ ticket # 0
           /\ ticket' = 0
           /\ lastTicket' = active
           /\ lastAt' = active
           /\ UNCHANGED <<active, phase, rolledBack>>

Freeze == /\ phase = "live"
          /\ active = 1
          /\ phase' = "frozen"
          /\ UNCHANGED <<active, ticket, lastTicket, lastAt, rolledBack>>

Swap == /\ phase = "frozen"
        /\ active' = 2
        /\ phase' = "live"
        /\ ticket' = 0
        /\ UNCHANGED <<lastTicket, lastAt, rolledBack>>

Rollback == /\ phase = "frozen"
            /\ active' = 1
            /\ phase' = "live"
            /\ ticket' = 0
            /\ rolledBack' = TRUE
            /\ UNCHANGED <<lastTicket, lastAt>>

Next == Issue \/ Execute \/ Freeze \/ Swap \/ Rollback
TypeOK == /\ active \in 1..2
          /\ phase \in {"live","frozen"}
          /\ ticket \in 0..2
          /\ lastTicket \in 0..2
          /\ lastAt \in 0..2
          /\ rolledBack \in BOOLEAN
NoStaleTicket == ticket = 0 \/ ticket = active
NoRetiredExecution == lastTicket = lastAt
Inv == TypeOK /\ NoStaleTicket /\ NoRetiredExecution
Spec == Init /\ [][Next]_vars
=============================================================================