// Bundled, fictional course content: shared by the demo seed and sample downloads.
const definitions = [
    ["Applied Econometrics", "ECON 378", [
        ["Regression and inference", "Regression review notes", [
            "A regression coefficient estimates the change in the outcome for a one-unit increase in a predictor, holding other included predictors constant.",
            "A confidence interval expresses uncertainty around an estimate. Across repeated samples, 95% confidence intervals constructed by the same method cover the true parameter about 95% of the time.",
            "Omitted-variable bias can arise when a missing factor affects the outcome and is correlated with an included predictor. Association alone does not establish causation."
        ], "A study-hours coefficient of 4 predicts four more exam points per additional study hour, holding the other predictors constant. Motivation may confound this relationship."],
        ["Hypothesis testing", "Hypothesis testing lecture notes", [
            "The null hypothesis specifies a reference claim, often that a population coefficient is zero.",
            "A p-value measures how surprising the observed result, or a more extreme result, would be under the null hypothesis and model assumptions.",
            "A Type I error rejects a true null hypothesis. Statistical significance does not establish practical importance."
        ], "For a two-sided test at the 5% level, p = 0.03 leads to rejection of the null. The effect size still matters for the decision."],
        ["Causal inference", "Experiments and causal claims", [
            "Random assignment balances potential confounders between treatment groups in expectation.",
            "A treatment effect compares outcomes under treatment with the counterfactual outcomes without treatment.",
            "Difference-in-differences compares changes across groups and depends on a credible parallel-trends assumption."
        ], "Compare attendance changes at tutoring and comparison schools before and after a program. Discuss whether their trends would have matched without the program."]
    ]],
    ["Competitive Strategy", "STRAT 401", [
        ["Competitive advantage", "Porter five forces case notes", [
            "The five forces are rivalry, buyer power, supplier power, the threat of substitutes, and the threat of new entrants.",
            "A substitute meets the same customer need in a different way; a direct rival competes within the same industry.",
            "Barriers to entry, such as scale economies and switching costs, can protect established firms but do not guarantee profitability."
        ], "In a fictional airline case, rail is a substitute, aircraft manufacturers are suppliers, and price-comparison sites strengthen buyer power."],
        ["Resources and capabilities", "VRIO framework notes", [
            "VRIO asks whether a resource is valuable, rare, costly to imitate, and supported by the organization.",
            "Resources are assets a firm controls; capabilities describe how it combines and uses those assets.",
            "A valuable but common resource may create competitive parity rather than a sustained advantage."
        ], "A fictional cafe has an exclusive roasting process, experienced staff, and reliable distribution. Evaluate each resource separately using VRIO."],
        ["Positioning and trade-offs", "Positioning workshop notes", [
            "Cost leadership seeks a lower cost structure, while differentiation offers distinctive value that customers will pay for.",
            "Strategic trade-offs require choosing which activities and customers a business will not pursue.",
            "Activity fit occurs when a firm's choices reinforce one another and make its position harder to copy."
        ], "A budget hotel skips room service and elaborate lobbies to support low prices and quick check-in. Adding luxury services could undermine its activity fit."]
    ]],
    ["Introduction to Biology", "BIO 101", [
        ["Cells and membranes", "Cell structure lecture notes", [
            "The plasma membrane is a selectively permeable phospholipid bilayer with embedded proteins.",
            "The nucleus houses most genetic information in eukaryotic cells. Ribosomes synthesize proteins.",
            "Diffusion moves particles down their concentration gradient; active transport requires energy to move substances against a gradient."
        ], "A cell placed in a hypertonic solution loses water through osmosis. Explain how the relative solute concentrations determine water movement."],
        ["Energy and metabolism", "Cellular respiration overview", [
            "Enzymes lower activation energy without changing the overall free-energy difference of a reaction.",
            "Glycolysis occurs in the cytosol and converts glucose into pyruvate with a small net ATP yield.",
            "In aerobic respiration, oxygen is the final electron acceptor in the electron transport chain."
        ], "Compare ATP production when oxygen is available with fermentation, which regenerates NAD+ so glycolysis can continue."],
        ["Genetics and inheritance", "Mendelian inheritance notes", [
            "Alleles are alternative versions of a gene. Genotype describes allele combinations, while phenotype describes observable traits.",
            "In a simple complete-dominance model, a heterozygote shows the dominant phenotype.",
            "A Punnett square describes probabilities for offspring, not guaranteed outcomes for a small family."
        ], "For Aa crossed with Aa, genotype probabilities are one-quarter AA, one-half Aa, and one-quarter aa. Under complete dominance, the phenotype ratio is 3:1."]
    ]],
    ["Introduction to Psychology", "PSYCH 101", [
        ["Research methods", "Psychology research notes", [
            "An experiment manipulates an independent variable and measures a dependent variable.",
            "Random assignment supports causal inference, while random sampling supports generalization to a population.",
            "An operational definition specifies how a variable is measured or manipulated. Correlation alone cannot establish causation."
        ], "A fictional experiment randomly assigns students to silent or noisy study rooms and measures recall using a ten-item test."],
        ["Learning and memory", "Memory and retrieval notes", [
            "Encoding brings information into memory, storage maintains it, and retrieval makes it available later.",
            "Retrieval practice involves recalling information rather than simply rereading it.",
            "Spacing practice across sessions can improve long-term retention compared with concentrating practice into one session."
        ], "Compare rereading a chapter three times in one evening with answering practice questions over three days. Identify retrieval practice and spacing."],
        ["Cognition and decisions", "Judgment and bias notes", [
            "A heuristic is a mental shortcut that can simplify decisions but may produce systematic errors.",
            "Confirmation bias favors evidence that supports an existing belief over evidence that challenges it.",
            "The availability heuristic relies on how easily examples come to mind, which may differ from their actual frequency."
        ], "After hearing about a rare travel accident, a student overestimates its likelihood. Explain availability and identify a useful base-rate comparison."]
    ]]
];

const demoCourses = definitions.map(([name, code, units], courseIndex) => ({
    name, code,
    units: units.map(([name, title, facts, example], unitIndex) => ({
        name,
        materials: [
            {
                title,
                role: courseIndex === 0 && unitIndex === 0 ? "exam_review" : "general",
                text: `${title}\n${code} — ${name}\nSample material for the Study AI demo.\n\nLEARNING GOALS\nExplain the key ideas, apply them to an example, and review them without looking at your notes.\n\nKEY IDEAS\n${facts.map((fact, index) => `${index + 1}. ${fact}`).join("\n\n")}\n\nWORKED EXAMPLE\n${example}\n\nSTUDY TIP\nUse these notes to create flashcards, a study guide, or a practice quiz. Check each answer against the source.`,
            },
            {
                title: `${name} — review sheet`, role: "exam_review",
                text: `${name} — review sheet\n${code}\nSample material for the Study AI demo.\n\nQUICK REVIEW\n${facts.join("\n\n")}\n\nPRACTICE\n1. Explain each key idea in your own words.\n2. Apply the ideas to this scenario: ${example}\n3. Write one common misconception and explain the correction.\n\nSELF-CHECK\nUse the definitions above, explain the mechanism rather than only naming it, and state any assumptions needed for your answer.`
            }
        ].map((material, materialIndex) => ({
            ...material,
            filename: `demo-sample-${courseIndex + 1}-${unitIndex + 1}-${materialIndex + 1}.txt`
        }))
    }))
}));

demoCourses[0].units[0].materials.push({
    title: "ECON 378 course syllabus", role: "syllabus", filename: "demo-sample-econ-syllabus.txt",
    text: "ECON 378 — Applied Econometrics\nSample syllabus for the Study AI demo.\n\nUnit 1: Regression and inference. Interpret coefficients, confidence intervals, and omitted-variable bias.\nUnit 2: Hypothesis testing. Explain null hypotheses, p-values, and practical significance.\nUnit 3: Causal inference. Compare randomized experiments and difference-in-differences.\n\nASSESSMENTS\nRegression problem set, regression practice quiz, and econometrics midterm. Open Planner for the sample deadlines, which are set relative to the start of each demo."
});

const demoMaterialFiles = new Map(demoCourses.flatMap(course =>
    course.units.flatMap(unit => unit.materials.map(material => [material.filename, material.text]))
));

module.exports = { demoCourses, demoMaterialFiles };
