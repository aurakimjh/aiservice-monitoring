package io.aitop.agent;

import net.bytebuddy.agent.builder.AgentBuilder;
import net.bytebuddy.asm.Advice;
import net.bytebuddy.matcher.ElementMatchers;

import java.lang.instrument.Instrumentation;
import java.util.Arrays;
import java.util.List;

/**
 * AITOP Java Agent entry point.
 *
 * Installs ByteBuddy-based method profiling instrumentation
 * targeting configurable class patterns.
 */
public class AitopAgent {

    private static final String TARGET_PACKAGES_PROP = "aitop.target.packages";
    private static final String DEFAULT_PATTERNS = "com.*.controller,com.*.service,com.*.repository";

    /**
     * JVM agent premain entry point.
     * Called before the application's main method when loaded via -javaagent.
     *
     * @param args agent arguments from the command line
     * @param inst the JVM instrumentation instance
     */
    public static void premain(String args, Instrumentation inst) {
        System.out.println("[AITOP] Initializing AITOP Java Agent v0.1.0");

        List<String> patterns = getTargetPatterns();
        System.out.println("[AITOP] Target patterns: " + patterns);

        AgentBuilder builder = new AgentBuilder.Default()
                .with(AgentBuilder.RedefinitionStrategy.RETRANSFORMATION)
                .with(new AgentBuilder.Listener.StreamWriting(System.out)
                        .withTransformationsOnly())
                .ignore(ElementMatchers.nameStartsWith("net.bytebuddy.")
                        .or(ElementMatchers.nameStartsWith("io.aitop.agent.")));

        for (String pattern : patterns) {
            String regex = patternToRegex(pattern);
            builder = builder.type(ElementMatchers.nameMatches(regex))
                    .transform((transformBuilder, typeDescription, classLoader, module, protectionDomain) ->
                            transformBuilder.method(ElementMatchers.isPublic()
                                            .and(ElementMatchers.not(ElementMatchers.isConstructor())))
                                    .intercept(Advice.to(MethodProfileAdvice.class))
                    );
        }

        builder.installOn(inst);
        System.out.println("[AITOP] Agent installed successfully");
    }

    /**
     * Reads target class patterns from system property or uses defaults.
     */
    private static List<String> getTargetPatterns() {
        String raw = System.getProperty(TARGET_PACKAGES_PROP, DEFAULT_PATTERNS);
        return Arrays.asList(raw.split(","));
    }

    /**
     * Converts a simplified glob pattern (e.g., "com.*.controller")
     * to a Java regex pattern (e.g., "com\\..*\\.controller\\..*").
     */
    private static String patternToRegex(String pattern) {
        String trimmed = pattern.trim();
        String escaped = trimmed.replace(".", "\\.");
        String regex = escaped.replace("*", ".*");
        return regex + "\\..*";
    }

    /**
     * ByteBuddy Advice for method-level profiling.
     * Records method entry/exit times and reports to AITOP collector.
     */
    public static class MethodProfileAdvice {

        @Advice.OnMethodEnter
        public static long onEnter() {
            return System.nanoTime();
        }

        @Advice.OnMethodExit(onThrowable = Throwable.class)
        public static void onExit(
                @Advice.Enter long startNanos,
                @Advice.Origin String method,
                @Advice.Thrown Throwable thrown) {
            long durationNanos = System.nanoTime() - startNanos;
            long durationMs = durationNanos / 1_000_000;

            String thresholdStr = System.getProperty("aitop.profiling.threshold", "5ms");
            long thresholdMs = parseThreshold(thresholdStr);

            if (durationMs >= thresholdMs) {
                // TODO: Send to AITOP collector via OTLP exporter
                // For now, log to stdout
                System.out.printf("[AITOP] %s took %dms%s%n",
                        method, durationMs,
                        thrown != null ? " [ERROR: " + thrown.getClass().getSimpleName() + "]" : "");
            }
        }

        private static long parseThreshold(String threshold) {
            String cleaned = threshold.toLowerCase().replace("ms", "").trim();
            try {
                return Long.parseLong(cleaned);
            } catch (NumberFormatException e) {
                return 5; // default 5ms
            }
        }
    }
}
