import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/**
 * Reviewer-side structural validator for one archived guest XML suite.
 * Adapted from oreslang-source.java/tools/VerifyAssuranceSurefire.java.
 * This checks the XML shape and exact guest test names, not that the
 * underlying untrusted tests performed the claimed guest execution.
 * Invoke in Java 21 source-file mode, with XML bytes on standard input.
 */
class VerifyArtifactGuestSurefire {
    private static final java.util.Map<String,Set<String>> REQUIRED = java.util.Map.ofEntries(
        java.util.Map.entry("dev.oreslang.CriticalActorGuestExecutionTest", Set.copyOf(List.of("actorCriticalGuestReturnsExpectedValueAndReleasesBeforeStop", "earlyReturnInsideCriticalReleasesGuardBeforeActorStop", "canonicalAttoActorCriticalGuestMatchesLegacyGuestOutput", "canonicalAttoEarlyReturnGuestReleasesBeforeStop", "canonicalAttoGuestOutputTracksARealSourceMutation", "canonicalAttoGuestCriticalBodyMutationChangesOutput", "canonicalAttoGuestSourceMutationWorksInBothDirections", "unverifiedFreeFunctionCriticalSourceDoesNotExecute"))),
        java.util.Map.entry("dev.oreslang.ActorBorrowCompilerAdmissionTest", Set.copyOf(List.of("twoSharedBorrowsCanCoexistWithoutExclusiveWriter", "independentExclusiveBorrowIsAllowedWhenNoReadLoanExists", "exclusiveWriterIsRejectedWhenTwoReadBorrowsAreLive", "ownershipTransferFailsWhileSharedBorrowIsLive", "sourceOwnerIsUnusableAfterRtTakeMove", "evenOneSharedReaderBlocksExclusiveWriter", "exclusiveWriterBlocksNewSharedReader", "secondExclusiveWriterIsNeverAdmitted", "reassignmentOfOwnerDuringReadBorrowIsRejected", "lexicalReadBorrowReleaseAllowsLaterExclusiveWriter", "lexicalExclusiveBorrowReleaseAllowsLaterReader", "lexicalReadBorrowReleaseAllowsOwnershipTake", "doubleRtTakeOfSameOwnedBindingIsRejected"))),
        java.util.Map.entry("dev.oreslang.CriticalSuspendsV1SyntaxTest", Set.copyOf(List.of("concurrentRetypingCannotPublishPartialTaskEpochBeforeCriticalAdmission", "newerConcurrentOwnershipAttemptSupersedesBlockedOlderAttempt", "criticalTaskPublicationIsAtomicAgainstConcurrentTypingRevocation"))),
        java.util.Map.entry("dev.oreslang.TaskCaptureAdmissionIdentityTest", Set.copyOf(List.of("rawHostAstAndForgedEpochCannotPublishTaskCaptures", "untypedNoncriticalTaskCannotAcquireExecutableOwnership", "successfulTypeRecheckRevokesPreviouslyExecutableNoncriticalTask", "failedTypeRecheckRevokesPreviouslyExecutableNoncriticalTask", "publicStagedCapturePublisherCannotMintTaskTransferAuthority"))),
        java.util.Map.entry("dev.oreslang.nodes.CriticalTicketCleanupTest", Set.copyOf(List.of("immediateTicketIsReleasedAfterFailedSchedulerTransition", "queuedTicketIsRetractedWithoutReleasingAnotherOwner", "retiredAdmissionIsSafeToUnwind", "cancellationRacingWithPromotionCannotLeakActorOwnedTicket"))),
        java.util.Map.entry("dev.oreslang.CriticalBodyEffectsTest", Set.copyOf(List.of())),
        java.util.Map.entry("dev.oreslang.runtime.CriticalGateTest", Set.copyOf(List.of())),
        java.util.Map.entry("dev.oreslang.runtime.ActorCriticalGateIdentityTest", Set.copyOf(List.of()))
    );
    private static int count(Element element, String field) {
        String raw = element.getAttribute(field);
        if (!raw.matches("[0-9]{1,6}")) throw new IllegalStateException("Invalid " + field);
        return Integer.parseInt(raw);
    }
    private static void check(boolean ok, String message) {
        if (!ok) throw new IllegalStateException(message);
    }
    private static int validate(byte[] data, String expectedSuite) throws Exception {
        Set<String> required=REQUIRED.get(expectedSuite);
        check(required!=null,"Unknown non-canonical Surefire suite");
        check(data.length > 0 && data.length <= 2_097_152, "Empty or oversized XML");
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        Document document;
        try (InputStream stream = new ByteArrayInputStream(data)) {
            document = factory.newDocumentBuilder().parse(stream);
        }
        check(document.getDoctype() == null, "DOCTYPE forbidden");
        Element suite = document.getDocumentElement();
        check("testsuite".equals(suite.getTagName()) &&
              expectedSuite.equals(suite.getAttribute("name")), "Wrong suite identity");
        int declared=count(suite,"tests");
        check(declared >= Math.max(1,required.size()) &&
              count(suite,"failures") == 0 && count(suite,"errors") == 0 &&
              count(suite,"skipped") == 0, "Wrong total or hidden failures/skips");
        Set<String> seen = new HashSet<>();
        NodeList nodes = suite.getChildNodes();
        int count = 0;
        for (int i = 0; i < nodes.getLength(); i++) {
            Node node = nodes.item(i);
            if (!(node instanceof Element element)) continue;
            String tag = element.getTagName();
            if ("testcase".equals(tag)) {
                count++;
                check(expectedSuite.equals(element.getAttribute("classname")), "Wrong testcase class");
                String name = element.getAttribute("name");
                check(!name.isBlank() && seen.add(name), "Blank or duplicate testcase");
                NodeList children = element.getChildNodes();
                for (int j = 0; j < children.getLength(); j++) {
                    if (!(children.item(j) instanceof Element child)) continue;
                    check(Set.of("system-out","system-err").contains(child.getTagName()),
                          "Failed, skipped, retried or unexpected testcase child");
                    check(child.getElementsByTagName("testcase").getLength() == 0 &&
                          child.getElementsByTagName("failure").getLength() == 0 &&
                          child.getElementsByTagName("error").getLength() == 0 &&
                          child.getElementsByTagName("skipped").getLength() == 0,
                          "Forged nested output node");
                }
            } else {
                check(Set.of("properties","system-out","system-err").contains(tag),
                      "Unexpected suite child");
                check(element.getElementsByTagName("testcase").getLength() == 0 &&
                      element.getElementsByTagName("failure").getLength() == 0 &&
                      element.getElementsByTagName("error").getLength() == 0 &&
                      element.getElementsByTagName("skipped").getLength() == 0,
                      "Hidden testcase or error in suite child");
            }
        }
        check(count == declared && seen.containsAll(required) &&
              (!expectedSuite.equals("dev.oreslang.CriticalActorGuestExecutionTest") ||
                seen.equals(required)),
              "Missing, duplicated or unexecuted required testcase");
        return count;
    }
    public static void main(String[] args) throws Exception {
        check(args.length == 1 && REQUIRED.containsKey(args[0]),
              "Only a canonical Surefire suite name and XML on stdin are supported");
        byte[] data = System.in.readNBytes(2_097_153);
        int testcases=validate(data,args[0]);
        System.out.println("VALID_SUREFIRE_XML suite="+args[0]+" tests="+testcases);
    }
}
