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
    private static final String SUITE = "dev.oreslang.CriticalActorGuestExecutionTest";
    private static final Set<String> REQUIRED = Set.copyOf(List.of(
        "actorCriticalGuestReturnsExpectedValueAndReleasesBeforeStop",
        "earlyReturnInsideCriticalReleasesGuardBeforeActorStop",
        "canonicalAttoActorCriticalGuestMatchesLegacyGuestOutput",
        "canonicalAttoEarlyReturnGuestReleasesBeforeStop",
        "canonicalAttoGuestOutputTracksARealSourceMutation",
        "canonicalAttoGuestCriticalBodyMutationChangesOutput",
        "canonicalAttoGuestSourceMutationWorksInBothDirections",
        "unverifiedFreeFunctionCriticalSourceDoesNotExecute"
    ));
    private static int count(Element element, String field) {
        String raw = element.getAttribute(field);
        if (!raw.matches("[0-9]{1,6}")) throw new IllegalStateException("Invalid " + field);
        return Integer.parseInt(raw);
    }
    private static void check(boolean ok, String message) {
        if (!ok) throw new IllegalStateException(message);
    }
    private static void validate(byte[] data) throws Exception {
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
              SUITE.equals(suite.getAttribute("name")), "Wrong suite identity");
        check(count(suite,"tests") == REQUIRED.size() &&
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
                check(SUITE.equals(element.getAttribute("classname")), "Wrong testcase class");
                String name = element.getAttribute("name");
                check(REQUIRED.contains(name) && seen.add(name), "Unknown or duplicate testcase");
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
        check(count == REQUIRED.size() && seen.equals(REQUIRED),
              "Missing, duplicated or unexecuted guest testcase");
    }
    public static void main(String[] args) throws Exception {
        check(args.length == 0, "Only XML on stdin is supported");
        byte[] data = System.in.readNBytes(2_097_153);
        validate(data);
        System.out.println("VALID_GUEST_SUREFIRE_XML tests=8");
    }
}
