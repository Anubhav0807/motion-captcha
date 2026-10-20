"""Generate synthetic training rows from the 50 originals.  Run from backend/:  python -m ml.resampling"""

import random
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from app.core.config import DATABASE_URL
from app.models import ClickMetrics, KeyboardMetrics, MouseMetrics, PredictionLabel, PredictionResults


# ============================================================
# CONFIG
# ============================================================

TARGET_PER_CLASS = 2500
ORIGINAL_PER_CLASS = 25

SYNTHETIC_PER_CLASS = TARGET_PER_CLASS - ORIGINAL_PER_CLASS

MIN_SAMPLES = 2
MAX_SAMPLES = 25

RANDOM_SEED = 42


# ============================================================
# DATABASE
# ============================================================

engine = create_engine(DATABASE_URL)

random.seed(RANDOM_SEED)


# ============================================================
# HELPERS
# ============================================================

def mean(values):
    values = list(values)
    return sum(values) / len(values)


def random_average(records, fields):
    """
    Randomly choose between 2 and 25 ORIGINAL records
    and calculate the mean of the requested fields.
    """

    sample_size = random.randint(
        MIN_SAMPLES,
        min(MAX_SAMPLES, len(records))
    )

    selected = random.sample(records, sample_size)

    return {
        field: mean(getattr(record, field) for record in selected)
        for field in fields
    }


# ============================================================
# GENERATE ONE SYNTHETIC RECORD
# ============================================================

def generate_synthetic_record(session, original_records):
    """
    Generate one complete synthetic prediction using ONLY
    the original records.
    """

    click_originals = original_records["click"]
    keyboard_originals = original_records["keyboard"]
    mouse_originals = original_records["mouse"]

    # --------------------------------------------------------
    # CLICK
    # --------------------------------------------------------

    click_values = random_average(
        click_originals,
        [
            "average_interval",
            "interval_variance",
            "total_clicks",
        ],
    )

    click = ClickMetrics(
        average_interval=click_values["average_interval"],
        interval_variance=click_values["interval_variance"],
        total_clicks=round(click_values["total_clicks"]),
    )

    session.add(click)
    session.flush()

    # --------------------------------------------------------
    # KEYBOARD
    # --------------------------------------------------------

    keyboard_values = random_average(
        keyboard_originals,
        [
            "average_hold_duration",
            "average_interval",
            "hold_duration_variance",
            "interval_variance",
            "total_key_presses",
        ],
    )

    keyboard = KeyboardMetrics(
        average_hold_duration=keyboard_values["average_hold_duration"],
        average_interval=keyboard_values["average_interval"],
        hold_duration_variance=keyboard_values["hold_duration_variance"],
        interval_variance=keyboard_values["interval_variance"],
        total_key_presses=round(
            keyboard_values["total_key_presses"]
        ),
    )

    session.add(keyboard)
    session.flush()

    # --------------------------------------------------------
    # MOUSE
    # --------------------------------------------------------

    mouse_values = random_average(
        mouse_originals,
        [
            "average_acceleration",
            "average_velocity",
            "direction_changes",
            "max_velocity",
            "total_distance",
            "total_samples",
        ],
    )

    mouse = MouseMetrics(
        average_acceleration=mouse_values["average_acceleration"],
        average_velocity=mouse_values["average_velocity"],
        direction_changes=round(
            mouse_values["direction_changes"]
        ),
        max_velocity=mouse_values["max_velocity"],
        total_distance=mouse_values["total_distance"],
        total_samples=round(
            mouse_values["total_samples"]
        ),
    )

    session.add(mouse)
    session.flush()

    return click, keyboard, mouse


# ============================================================
# MAIN
# ============================================================

def main():

    with Session(engine) as session:

        # ----------------------------------------------------
        # Get all existing prediction results
        # ----------------------------------------------------

        predictions = session.scalars(
            select(PredictionResults)
        ).all()

        if len(predictions) != 50:
            raise RuntimeError(
                f"Expected exactly 50 PredictionResults, "
                f"found {len(predictions)}"
            )

        # ----------------------------------------------------
        # Separate HUMAN / BOT
        # ----------------------------------------------------

        human_predictions = [
            p for p in predictions
            if p.label == PredictionLabel.HUMAN
        ]

        bot_predictions = [
            p for p in predictions
            if p.label == PredictionLabel.BOT
        ]

        if len(human_predictions) != ORIGINAL_PER_CLASS:
            raise RuntimeError(
                f"Expected 25 human records, "
                f"found {len(human_predictions)}"
            )

        if len(bot_predictions) != ORIGINAL_PER_CLASS:
            raise RuntimeError(
                f"Expected 25 bot records, "
                f"found {len(bot_predictions)}"
            )

        # ----------------------------------------------------
        # IMPORTANT:
        #
        # Get the ORIGINAL metric records.
        #
        # We use these lists forever as the source.
        # Newly generated records are NEVER added here.
        # ----------------------------------------------------

        click_records = session.scalars(
            select(ClickMetrics)
        ).all()

        keyboard_records = session.scalars(
            select(KeyboardMetrics)
        ).all()

        mouse_records = session.scalars(
            select(MouseMetrics)
        ).all()

        if len(click_records) != 50:
            raise RuntimeError(
                f"Expected 50 click records, "
                f"found {len(click_records)}"
            )

        if len(keyboard_records) != 50:
            raise RuntimeError(
                f"Expected 50 keyboard records, "
                f"found {len(keyboard_records)}"
            )

        if len(mouse_records) != 50:
            raise RuntimeError(
                f"Expected 50 mouse records, "
                f"found {len(mouse_records)}"
            )

        # ----------------------------------------------------
        # Determine which metric records belong to each class
        #
        # PredictionResults tells us the relationship.
        # ----------------------------------------------------

        def get_original_metrics(predictions):

            click = [
                next(
                    c for c in click_records
                    if c.id == p.click_metrics_id
                )
                for p in predictions
            ]

            keyboard = [
                next(
                    k for k in keyboard_records
                    if k.id == p.keyboard_metrics_id
                )
                for p in predictions
            ]

            mouse = [
                next(
                    m for m in mouse_records
                    if m.id == p.mouse_metrics_id
                )
                for p in predictions
            ]

            return {
                "click": click,
                "keyboard": keyboard,
                "mouse": mouse,
            }

        human_originals = get_original_metrics(
            human_predictions
        )

        bot_originals = get_original_metrics(
            bot_predictions
        )

        # ----------------------------------------------------
        # Generate HUMAN records
        # ----------------------------------------------------

        print(
            f"Generating {SYNTHETIC_PER_CLASS} human records..."
        )

        for i in range(SYNTHETIC_PER_CLASS):

            click, keyboard, mouse = generate_synthetic_record(
                session,
                human_originals
            )

            prediction = PredictionResults(
                click_metrics_id=click.id,
                keyboard_metrics_id=keyboard.id,
                mouse_metrics_id=mouse.id,
                label=PredictionLabel.HUMAN,
            )

            session.add(prediction)

            if (i + 1) % 250 == 0:
                print(
                    f"  Human: {i + 1}/{SYNTHETIC_PER_CLASS}"
                )
                session.flush()

        # ----------------------------------------------------
        # Generate BOT records
        # ----------------------------------------------------

        print(
            f"Generating {SYNTHETIC_PER_CLASS} bot records..."
        )

        for i in range(SYNTHETIC_PER_CLASS):

            click, keyboard, mouse = generate_synthetic_record(
                session,
                bot_originals
            )

            prediction = PredictionResults(
                click_metrics_id=click.id,
                keyboard_metrics_id=keyboard.id,
                mouse_metrics_id=mouse.id,
                label=PredictionLabel.BOT,
            )

            session.add(prediction)

            if (i + 1) % 250 == 0:
                print(
                    f"  Bot: {i + 1}/{SYNTHETIC_PER_CLASS}"
                )
                session.flush()

        # ----------------------------------------------------
        # Commit all generated data
        # ----------------------------------------------------

        session.commit()

        print("\nGeneration complete.")

        # ----------------------------------------------------
        # Verify counts
        # ----------------------------------------------------

        total_predictions = session.scalar(
            select(
                func.count(
                    PredictionResults.id
                )
            )
        )

        total_humans = session.scalar(
            select(
                func.count(
                    PredictionResults.id
                )
            ).where(
                PredictionResults.label == PredictionLabel.HUMAN
            )
        )

        total_bots = session.scalar(
            select(
                func.count(
                    PredictionResults.id
                )
            ).where(
                PredictionResults.label == PredictionLabel.BOT
            )
        )

        print(f"\nPredictionResults:")
        print(f"  Total : {total_predictions}")
        print(f"  Human : {total_humans}")
        print(f"  Bot   : {total_bots}")

        print("\nExpected:")
        print("  Total : 5000")
        print("  Human : 2500")
        print("  Bot   : 2500")


if __name__ == "__main__":
    main()