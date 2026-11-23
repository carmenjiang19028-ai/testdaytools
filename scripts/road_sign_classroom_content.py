"""Original classroom exercise shared by the browser and PDF worksheets."""

RECOGNITION_ITEMS = (
    ("stop", "stop", "Stop", "Come to a complete stop, yield, then proceed when safe."),
    ("yield", "yield", "Yield", "Slow and give right of way when another road user has priority."),
    ("do-not-enter", "do-not-enter", "Do Not Enter", "Do not enter the roadway, ramp, or restricted direction."),
    ("speed-limit", "speed-limit", "Speed Limit", "Do not exceed the posted legal maximum under normal conditions."),
    ("merge", "merge", "Merge", "Expect joining traffic. Watch for conflicts and leave space; your lane might continue."),
    ("school", "school-crossing", "School Crossing", "Slow, scan for children, and obey posted school-zone controls."),
    ("railroad", "railroad", "Railroad Crossing Ahead", "Prepare for tracks and obey lights, gates, or a crossbuck."),
    ("slippery", "slippery", "Slippery When Wet", "Reduce speed and avoid sudden steering or braking."),
)
CLASSROOM_SIGNS = {kind: image for kind, image, _, _ in RECOGNITION_ITEMS}
DECISION_REVIEWED = "2026-11-21"
DECISION_CASES = [
    (
        "At STOP, you can see an empty intersection beyond the stop line. What comes first?",
        ("Roll past the line while checking again.", "Stop before the line, then yield and proceed when safe.",
         "Stop beyond the line where you have the best view."),
        1, "A clear view changes the gap decision, not where or whether to stop.",
    ),
    (
        "At YIELD, a pedestrian has started crossing your path. What should you do?",
        ("Give way and stop if needed before proceeding.", "Keep rolling; only a STOP sign can require a full stop.",
         "Stop for a fixed count, then enter even if the path stays blocked."),
        0, "Giving way may require a stop. Counting seconds does not clear a conflict.",
    ),
    (
        "A LANE ENDS warning and the markings show your lane will end. How should you prepare?",
        ("Assume the warning only applies to traffic joining from a ramp.",
         "Move across right away; the warning gives your lane priority.",
         "Follow the markings and move into a safe gap."),
        2, "Lane reduction means your lane ends, but the warning does not give you priority.",
    ),
    (
        "A yellow-green diamond shows a person walking. People are near the crosswalk. What now?",
        ("Slow, scan for crossing people, and be ready to yield.", "Treat the color alone as a school speed limit.",
         "Stop at the warning sign itself, regardless of where the crossing is."),
        0, "The symbol warns of pedestrians; the color alone does not set a speed limit.",
    ),
    (
        "It is raining and you see SLIPPERY WHEN WET before a curve. What is the better response?",
        ("Hold your speed until you feel the tires slip.", "Reduce speed before the curve and steer and brake smoothly.",
         "Wait until you are turning, then brake firmly."),
        1, "Slow before the curve. Sudden braking or steering on wet pavement can reduce control.",
    ),
    (
        "You see a round railroad warning sign, but the tracks are not yet in view. What now?",
        ("Look and listen for trains; prepare to stop and obey the crossing controls.",
         "Wait for the tracks to come into view before you start checking.",
         "Treat the round warning as the crossing itself."),
        0, "The circle is an advance warning. Check before you reach the tracks.",
    ),
    (
        "After an orange work-zone warning, a flagger faces you with a STOP paddle. What now?",
        ("Proceed slowly if the lane looks open.",
         "Stop briefly, then follow the previous vehicle without waiting for a signal.",
         "Stop as directed and wait for the flagger to signal you through."),
        2, "The orange sign warns; the flagger's paddle controls whether you may proceed.",
    ),
    (
        "A red slash crosses a right-turn arrow. The light is green. May you turn right?",
        ("Yes, if you yield first.", "No. Follow a permitted movement and choose another route.",
         "Yes; the slash applies only while the light is red."),
        1, "NO RIGHT TURN is not NO TURN ON RED. Green does not cancel the posted prohibition.",
    ),
]
TRANSFER_PROMPT = (
    "Now your lane continues, but a ramp joins from the right. What should you watch for, "
    "and why does a MERGE warning not require you to leave your lane?"
)
TRANSFER_KEY = (
    "Watch for joining traffic and leave space. The warning does not say that your lane ends; "
    "use the actual lane markings and traffic conditions before changing lanes."
)
PENNDOT_SIGNS_URL = "https://www.pa.gov/agencies/dmv/driver-services/pennsylvania-drivers-manual/online-drivers-manual/signs"
FHWA_FLAGGER_URL = "https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/part6r1.pdf"
