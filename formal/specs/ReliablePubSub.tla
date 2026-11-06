------------------------- MODULE ReliablePubSub -------------------------
EXTENDS Naturals, FiniteSets, TLC

\* Bounded two-publisher, capacity-one, generation-fenced RELIABLE model.
\* Delivery history is retained solely for detecting early acknowledgements.
CONSTANTS A, B
ASSUME A # B
Publishers == {A,B}
NoMsg == [publisher |-> "none", seq |-> 0, generation |-> 0]
Events == [publisher:Publishers,seq:1..2,generation:1..2]
VARIABLES generation, seqA, seqB, queue, delivered, acked, cancelled
vars == <<generation, seqA, seqB, queue, delivered, acked, cancelled>>

Init == /\ generation = 1
        /\ seqA = 0
        /\ seqB = 0
        /\ queue = NoMsg
        /\ delivered = {}
        /\ acked = {}
        /\ cancelled = FALSE

Publish(p) == /\ p \in Publishers
              /\ ~cancelled
              /\ queue = NoMsg
              /\ IF p = A THEN seqA < 2 ELSE seqB < 2
              /\ queue' = [publisher |-> p,
                           seq |-> IF p = A THEN seqA+1 ELSE seqB+1,
                           generation |-> generation]
              /\ IF p = A
                    THEN /\ seqA' = seqA+1
                         /\ UNCHANGED seqB
                    ELSE /\ seqB' = seqB+1
                         /\ UNCHANGED seqA
              /\ UNCHANGED <<generation, delivered, acked, cancelled>>

Deliver == /\ queue # NoMsg
           /\ ~cancelled
           /\ delivered' = delivered \cup {queue}
           /\ queue' = NoMsg
           /\ UNCHANGED <<generation, seqA, seqB, acked, cancelled>>

Acknowledge(m) == /\ m \in delivered
                  /\ m \notin acked
                  /\ m.generation = generation
                  /\ ~cancelled
                  /\ acked' = acked \cup {m}
                  /\ UNCHANGED <<generation, seqA, seqB, queue, delivered, cancelled>>

Rejoin == /\ generation = 1
          /\ generation' = 2
          /\ queue' = NoMsg
          /\ cancelled' = FALSE
          /\ UNCHANGED <<seqA, seqB, delivered, acked>>

Cancel == /\ ~cancelled
          /\ cancelled' = TRUE
          /\ queue' = NoMsg
          /\ UNCHANGED <<generation, seqA, seqB, delivered, acked>>

Next == ( \E p \in Publishers: Publish(p))
     \/ Deliver
     \/ ( \E m \in delivered: Acknowledge(m))
     \/ Rejoin
     \/ Cancel

TypeOK == /\ generation \in 1..2
          /\ seqA \in 0..2
          /\ seqB \in 0..2
          /\ queue \in Events \cup {NoMsg}
          /\ delivered \subseteq Events
          /\ acked \subseteq Events
          /\ cancelled \in BOOLEAN

NoEarlyAck == acked \subseteq delivered
NoStaleQueue == queue = NoMsg \/ queue.generation = generation
NoCancelledQueue == cancelled => queue = NoMsg
Inv == TypeOK /\ NoEarlyAck /\ NoStaleQueue /\ NoCancelledQueue
Spec == Init /\ [][Next]_vars
=============================================================================