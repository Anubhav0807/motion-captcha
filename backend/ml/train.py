"""Train the CatBoost + TabPFN risk model.  Run from backend/:  python -m ml.train"""

import pandas as pd
import joblib

from sqlalchemy import create_engine, text

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
)

from catboost import CatBoostClassifier
from tabpfn import TabPFNClassifier

# Loads .env (DATABASE_URL, TABPFN_TOKEN) and the shared paths.
from app.core.config import DATABASE_URL, MODEL_PATH


# ============================================================
# CONFIG
# ============================================================

RANDOM_STATE = 42

MODEL_OUTPUT = MODEL_PATH   # assets/models/risk_model.joblib by default


# ============================================================
# DATABASE
# ============================================================

engine = create_engine(DATABASE_URL)


# ============================================================
# LOAD DATA
# ============================================================

def load_data():

    query = text("""
        SELECT
            pr.id,

            -- Click metrics
            cm.average_interval AS click_average_interval,
            cm.interval_variance AS click_interval_variance,
            cm.total_clicks,

            -- Keyboard metrics
            km.average_hold_duration,
            km.average_interval AS keyboard_average_interval,
            km.hold_duration_variance,
            km.interval_variance AS keyboard_interval_variance,
            km.total_key_presses,

            -- Mouse metrics
            mm.average_acceleration,
            mm.average_velocity,
            mm.direction_changes,
            mm.max_velocity,
            mm.total_distance,
            mm.total_samples,

            -- Label
            pr.label

        FROM prediction_results pr

        JOIN click_metrics cm
            ON pr.click_metrics_id = cm.id

        JOIN keyboard_metrics km
            ON pr.keyboard_metrics_id = km.id

        JOIN mouse_metrics mm
            ON pr.mouse_metrics_id = mm.id
    """)

    with engine.connect() as connection:
        df = pd.read_sql(query, connection)

    return df


# ============================================================
# FEATURES
# ============================================================

FEATURE_COLUMNS = [

    # Click
    "click_average_interval",
    "click_interval_variance",
    "total_clicks",

    # Keyboard
    "average_hold_duration",
    "keyboard_average_interval",
    "hold_duration_variance",
    "keyboard_interval_variance",
    "total_key_presses",

    # Mouse
    "average_acceleration",
    "average_velocity",
    "direction_changes",
    "max_velocity",
    "total_distance",
    "total_samples",
]


# ============================================================
# PREPARE DATA
# ============================================================

def prepare_data(df):

    X = df[FEATURE_COLUMNS].copy()

    # HUMAN = 0
    # BOT   = 1
    y = (
        df["label"]
        .astype(str)
        .str.lower()
        .map({
            "human": 0,
            "bot": 1,
        })
    )

    if y.isna().any():
        raise ValueError(
            "Unknown labels found in database."
        )

    # Make sure everything is numeric
    X = X.apply(pd.to_numeric, errors="coerce")

    if X.isna().any().any():
        raise ValueError(
            "NaN/non-numeric values found in feature columns."
        )

    return X, y


# ============================================================
# EVALUATION
# ============================================================

def evaluate_model(name, model, X_test, y_test):

    probabilities = model.predict_proba(X_test)[:, 1]

    predictions = (probabilities >= 0.5).astype(int)

    accuracy = accuracy_score(
        y_test,
        predictions
    )

    precision = precision_score(
        y_test,
        predictions,
        zero_division=0
    )

    recall = recall_score(
        y_test,
        predictions,
        zero_division=0
    )

    f1 = f1_score(
        y_test,
        predictions,
        zero_division=0
    )

    auc = roc_auc_score(
        y_test,
        probabilities
    )

    print(f"\n{'=' * 55}")
    print(name)
    print(f"{'=' * 55}")

    print(f"Accuracy : {accuracy:.4f}")
    print(f"Precision: {precision:.4f}")
    print(f"Recall   : {recall:.4f}")
    print(f"F1 Score : {f1:.4f}")
    print(f"ROC-AUC  : {auc:.4f}")

    return probabilities


# ============================================================
# MAIN
# ============================================================

def main():

    print("Loading dataset...")

    df = load_data()

    print(f"Total records: {len(df)}")

    print("\nClass distribution:")
    print(df["label"].value_counts())

    # --------------------------------------------------------
    # Prepare
    # --------------------------------------------------------

    X, y = prepare_data(df)

    # --------------------------------------------------------
    # Train/test split
    # --------------------------------------------------------

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=RANDOM_STATE,
        stratify=y,
        shuffle=True,
    )

    print("\nTraining samples:", len(X_train))
    print("Testing samples :", len(X_test))

    # ========================================================
    # MODEL 1 — LOGISTIC REGRESSION
    # ========================================================

    print("\nTraining Logistic Regression...")

    logistic = Pipeline([
        (
            "scaler",
            StandardScaler()
        ),
        (
            "classifier",
            LogisticRegression(
                random_state=RANDOM_STATE,
                max_iter=2000
            )
        )
    ])

    logistic.fit(
        X_train,
        y_train
    )

    logistic_prob = evaluate_model(
        "LOGISTIC REGRESSION",
        logistic,
        X_test,
        y_test
    )

    # ========================================================
    # MODEL 2 — CATBOOST
    # ========================================================

    print("\nTraining CatBoost...")

    catboost = CatBoostClassifier(
        iterations=500,
        depth=6,
        learning_rate=0.05,
        loss_function="Logloss",
        eval_metric="AUC",
        random_seed=RANDOM_STATE,
        verbose=False,
    )

    catboost.fit(
        X_train,
        y_train
    )

    catboost_prob = evaluate_model(
        "CATBOOST",
        catboost,
        X_test,
        y_test
    )

    # ========================================================
    # MODEL 3 — TABPFN
    # ========================================================

    print("\nTraining TabPFN...")

    tabpfn = TabPFNClassifier(
        device="cuda",
        random_state=RANDOM_STATE
    )

    tabpfn.fit(
        X_train,
        y_train
    )

    tabpfn_prob = evaluate_model(
        "TABPFN",
        tabpfn,
        X_test,
        y_test
    )

    # ========================================================
    # ENSEMBLE
    # ========================================================

    print("\nTraining ensemble...")

    # We use the two stronger models for the final score.
    #
    # CatBoost = 50%
    # TabPFN   = 50%

    ensemble_probability = (
        0.50 * catboost_prob
        +
        0.50 * tabpfn_prob
    )

    ensemble_prediction = (
        ensemble_probability >= 0.5
    ).astype(int)

    ensemble_accuracy = accuracy_score(
        y_test,
        ensemble_prediction
    )

    ensemble_precision = precision_score(
        y_test,
        ensemble_prediction,
        zero_division=0
    )

    ensemble_recall = recall_score(
        y_test,
        ensemble_prediction,
        zero_division=0
    )

    ensemble_f1 = f1_score(
        y_test,
        ensemble_prediction,
        zero_division=0
    )

    ensemble_auc = roc_auc_score(
        y_test,
        ensemble_probability
    )

    print(f"\n{'=' * 55}")
    print("TABPFN + CATBOOST ENSEMBLE")
    print(f"{'=' * 55}")

    print(f"Accuracy : {ensemble_accuracy:.4f}")
    print(f"Precision: {ensemble_precision:.4f}")
    print(f"Recall   : {ensemble_recall:.4f}")
    print(f"F1 Score : {ensemble_f1:.4f}")
    print(f"ROC-AUC  : {ensemble_auc:.4f}")

    # ========================================================
    # TRAIN FINAL MODELS ON ALL DATA
    # ========================================================

    print("\nTraining final models on complete dataset...")

    final_catboost = CatBoostClassifier(
        iterations=500,
        depth=6,
        learning_rate=0.05,
        loss_function="Logloss",
        random_seed=RANDOM_STATE,
        verbose=False,
    )

    final_catboost.fit(
        X,
        y
    )

    final_tabpfn = TabPFNClassifier(
        random_state=RANDOM_STATE
    )

    final_tabpfn.fit(
        X,
        y
    )

    # ========================================================
    # SAVE
    # ========================================================

    model_package = {
        "catboost": final_catboost,
        "tabpfn": final_tabpfn,
        "features": FEATURE_COLUMNS,
        "catboost_weight": 0.50,
        "tabpfn_weight": 0.50,
    }

    joblib.dump(
        model_package,
        MODEL_OUTPUT
    )

    print(
        f"\nModel saved to: {MODEL_OUTPUT}"
    )

    print("\nTraining complete.")


if __name__ == "__main__":
    main()