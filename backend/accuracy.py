import pandas as pd
import numpy as np

from sqlalchemy import create_engine, text

from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
)

from catboost import CatBoostClassifier
from tabpfn import TabPFNClassifier

import torch


# ============================================================
# CONFIGURATION
# ============================================================

DATABASE_URL = "postgresql://postgres:tiger@localhost:5432/motion_captcha"

RANDOM_STATE = 42
N_SPLITS = 5

CATBOOST_WEIGHT = 0.50
TABPFN_WEIGHT = 0.50

engine = create_engine(DATABASE_URL)


# ============================================================
# FEATURES
# ============================================================

FEATURE_COLUMNS = [
    "click_average_interval",
    "click_interval_variance",
    "total_clicks",

    "average_hold_duration",
    "keyboard_average_interval",
    "hold_duration_variance",
    "keyboard_interval_variance",
    "total_key_presses",

    "average_acceleration",
    "average_velocity",
    "direction_changes",
    "max_velocity",
    "total_distance",
    "total_samples",
]


# ============================================================
# LOAD ORIGINAL DATA
# ============================================================

def load_original_data():

    query = text("""
        SELECT
            pr.id,

            cm.average_interval AS click_average_interval,
            cm.interval_variance AS click_interval_variance,
            cm.total_clicks,

            km.average_hold_duration,
            km.average_interval AS keyboard_average_interval,
            km.hold_duration_variance,
            km.interval_variance AS keyboard_interval_variance,
            km.total_key_presses,

            mm.average_acceleration,
            mm.average_velocity,
            mm.direction_changes,
            mm.max_velocity,
            mm.total_distance,
            mm.total_samples,

            pr.label

        FROM prediction_results pr

        JOIN click_metrics cm
            ON pr.click_metrics_id = cm.id

        JOIN keyboard_metrics km
            ON pr.keyboard_metrics_id = km.id

        JOIN mouse_metrics mm
            ON pr.mouse_metrics_id = mm.id

        ORDER BY pr.id
    """)

    with engine.connect() as connection:
        df = pd.read_sql(query, connection)

    return df


# ============================================================
# PREPARE DATA
# ============================================================

def prepare_data(df):

    X = df[FEATURE_COLUMNS].copy()

    # Make sure every feature is numeric
    X = X.apply(pd.to_numeric, errors="coerce")

    if X.isna().any().any():
        raise ValueError(
            "Dataset contains NaN or non-numeric feature values."
        )

    # Convert labels
    #
    # human = 0
    # bot   = 1
    #
    y = (
        df["label"]
        .astype(str)
        .str.lower()
        .map({
            "human": 0,
            "bot": 1
        })
    )

    if y.isna().any():
        raise ValueError(
            "Dataset contains an unknown label."
        )

    return X, y.astype(int)


# ============================================================
# CREATE LOGISTIC REGRESSION BASELINE
# ============================================================

def create_logistic_regression():
    return Pipeline([
        ("scaler", StandardScaler()),
        ("model", LogisticRegression(
            max_iter=2000,
            random_state=RANDOM_STATE,
        )),
    ])


# ============================================================
# CREATE CATBOOST MODEL
# ============================================================

def create_catboost():

    return CatBoostClassifier(
        iterations=500,
        depth=6,
        learning_rate=0.05,
        loss_function="Logloss",
        eval_metric="AUC",
        random_seed=RANDOM_STATE,
        verbose=False,
    )


# ============================================================
# CREATE TABPFN MODEL
# ============================================================

def create_tabpfn():

    # Use GPU if available
    if torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"

    return TabPFNClassifier(
        device=device,
        random_state=RANDOM_STATE,
    )


# ============================================================
# CALCULATE METRICS
# ============================================================

def calculate_metrics(y_true, probabilities):

    predictions = (
        probabilities >= 0.5
    ).astype(int)

    return {
        "accuracy": accuracy_score(
            y_true,
            predictions
        ),

        "precision": precision_score(
            y_true,
            predictions,
            zero_division=0
        ),

        "recall": recall_score(
            y_true,
            predictions,
            zero_division=0
        ),

        "f1": f1_score(
            y_true,
            predictions,
            zero_division=0
        ),

        "roc_auc": roc_auc_score(
            y_true,
            probabilities
        ),
    }


# ============================================================
# PRINT METRICS
# ============================================================

def print_metrics(name, metrics):

    print()
    print(name)

    print(
        f"  Accuracy : {metrics['accuracy']:.4f}"
    )

    print(
        f"  Precision: {metrics['precision']:.4f}"
    )

    print(
        f"  Recall   : {metrics['recall']:.4f}"
    )

    print(
        f"  F1 Score : {metrics['f1']:.4f}"
    )

    print(
        f"  ROC-AUC  : {metrics['roc_auc']:.4f}"
    )


# ============================================================
# MAIN
# ============================================================

def main():

    print("=" * 70)
    print("MOTION CAPTCHA — MODEL VALIDATION")
    print("=" * 70)


    # --------------------------------------------------------
    # LOAD DATA
    # --------------------------------------------------------

    df = load_original_data()

    print()
    print("Dataset:")
    print(f"  Records : {len(df)}")


    print()
    print("Class distribution:")
    print(df["label"].value_counts())


    # --------------------------------------------------------
    # PREPARE DATA
    # --------------------------------------------------------

    X, y = prepare_data(df)


    print()
    print("Features:")

    for feature in FEATURE_COLUMNS:
        print(f"  - {feature}")

    print(
        f"\nTotal features: {len(FEATURE_COLUMNS)}"
    )


    # --------------------------------------------------------
    # HARDWARE
    # --------------------------------------------------------

    print()
    print("Hardware:")

    if torch.cuda.is_available():

        print("  CUDA available : YES")

        print(
            "  GPU            :",
            torch.cuda.get_device_name(0)
        )

    else:

        print("  CUDA available : NO")
        print("  TabPFN will use CPU.")


    # --------------------------------------------------------
    # CROSS VALIDATION
    # --------------------------------------------------------

    cv = StratifiedKFold(
        n_splits=N_SPLITS,
        shuffle=True,
        random_state=RANDOM_STATE,
    )


    # Store metrics from every fold
    all_metrics = {
        "Logistic Regression": [],
        "CatBoost": [],
        "TabPFN": [],
        "Ensemble": [],
    }


    # Store predictions for aggregated confusion matrices
    all_predictions = {
        "Logistic Regression": [],
        "CatBoost": [],
        "TabPFN": [],
        "Ensemble": [],
    }


    all_actual = []


    # ========================================================
    # RUN EACH FOLD
    # ========================================================

    for fold, (train_idx, test_idx) in enumerate(
        cv.split(X, y),
        start=1
    ):

        print()
        print()
        print("=" * 70)
        print(f"FOLD {fold}/{N_SPLITS}")
        print("=" * 70)


        # ----------------------------------------------------
        # Split data
        # ----------------------------------------------------

        X_train = X.iloc[train_idx]
        X_test = X.iloc[test_idx]

        y_train = y.iloc[train_idx]
        y_test = y.iloc[test_idx]


        print(
            f"Training samples: {len(X_train)}"
        )

        print(
            f"Testing samples : {len(X_test)}"
        )


        # ====================================================
        # LOGISTIC REGRESSION BASELINE
        # ====================================================

        print()
        print("Training Logistic Regression baseline...")

        logistic_regression = create_logistic_regression()
        logistic_regression.fit(X_train, y_train)

        logistic_probability = (
            logistic_regression.predict_proba(X_test)[:, 1]
        )

        logistic_metrics = calculate_metrics(
            y_test,
            logistic_probability
        )

        print_metrics(
            "Logistic Regression (Baseline)",
            logistic_metrics
        )


        # ====================================================
        # CATBOOST
        # ====================================================

        print()
        print("Training CatBoost...")

        catboost = create_catboost()

        catboost.fit(
            X_train,
            y_train
        )


        catboost_probability = (
            catboost
            .predict_proba(X_test)[:, 1]
        )


        catboost_metrics = calculate_metrics(
            y_test,
            catboost_probability
        )


        print_metrics(
            "CatBoost",
            catboost_metrics
        )


        # ====================================================
        # TABPFN
        # ====================================================

        print()
        print("Training TabPFN...")

        tabpfn = create_tabpfn()

        tabpfn.fit(
            X_train,
            y_train
        )


        tabpfn_probability = (
            tabpfn
            .predict_proba(X_test)[:, 1]
        )


        tabpfn_metrics = calculate_metrics(
            y_test,
            tabpfn_probability
        )


        print_metrics(
            "TabPFN",
            tabpfn_metrics
        )


        # ====================================================
        # ENSEMBLE
        # ====================================================

        ensemble_probability = (

            CATBOOST_WEIGHT
            * catboost_probability

            +

            TABPFN_WEIGHT
            * tabpfn_probability
        )


        ensemble_metrics = calculate_metrics(
            y_test,
            ensemble_probability
        )


        print_metrics(
            "CatBoost + TabPFN Ensemble",
            ensemble_metrics
        )


        # ----------------------------------------------------
        # Store metrics
        # ----------------------------------------------------

        all_metrics["Logistic Regression"].append(
            logistic_metrics
        )

        all_metrics["CatBoost"].append(
            catboost_metrics
        )

        all_metrics["TabPFN"].append(
            tabpfn_metrics
        )

        all_metrics["Ensemble"].append(
            ensemble_metrics
        )


        # ----------------------------------------------------
        # Store predictions
        # ----------------------------------------------------

        all_predictions["Logistic Regression"].extend(
            (
                logistic_probability >= 0.5
            ).astype(int)
        )

        all_predictions["CatBoost"].extend(
            (
                catboost_probability >= 0.5
            ).astype(int)
        )

        all_predictions["TabPFN"].extend(
            (
                tabpfn_probability >= 0.5
            ).astype(int)
        )

        all_predictions["Ensemble"].extend(
            (
                ensemble_probability >= 0.5
            ).astype(int)
        )


        all_actual.extend(
            y_test.tolist()
        )


    # ========================================================
    # CROSS VALIDATION RESULTS
    # ========================================================

    print()
    print()
    print("=" * 70)
    print("CROSS-VALIDATION RESULTS")
    print("=" * 70)


    for model_name, fold_metrics in all_metrics.items():

        print()
        print("-" * 70)
        print(model_name)
        print("-" * 70)


        for metric_name in [
            "accuracy",
            "precision",
            "recall",
            "f1",
            "roc_auc",
        ]:

            values = [
                fold[metric_name]
                for fold in fold_metrics
            ]


            mean_value = np.mean(values)

            std_value = np.std(
                values,
                ddof=1
            )


            print(
                f"{metric_name.upper():10s}: "
                f"{mean_value:.4f} +/- {std_value:.4f}"
            )


    # ========================================================
    # CONFUSION MATRICES
    # ========================================================

    print()
    print()
    print("=" * 70)
    print("AGGREGATED CONFUSION MATRICES")
    print("=" * 70)

    print()
    print("Rows = Actual")
    print("Columns = Predicted")

    print()
    print("             HUMAN   BOT")


    for model_name, predictions in all_predictions.items():

        cm = confusion_matrix(
            all_actual,
            predictions,
            labels=[0, 1]
        )


        print()
        print(model_name)

        print(
            f"Human       "
            f"{cm[0][0]:5d}  "
            f"{cm[0][1]:5d}"
        )

        print(
            f"Bot         "
            f"{cm[1][0]:5d}  "
            f"{cm[1][1]:5d}"
        )


    # ========================================================
    # FINAL SUMMARY
    # ========================================================

    print()
    print()
    print("=" * 70)
    print("FINAL SUMMARY")
    print("=" * 70)


    print()
    print("Validation method:")

    print("  5-fold stratified cross-validation")
    print("  14 original features")

    print(
        f"  Ensemble weights: "
        f"CatBoost={CATBOOST_WEIGHT:.2f}, "
        f"TabPFN={TABPFN_WEIGHT:.2f}"
    )


    print()
    print("Mean CV performance:")


    for model_name, fold_metrics in all_metrics.items():

        accuracy_values = [
            fold["accuracy"]
            for fold in fold_metrics
        ]

        f1_values = [
            fold["f1"]
            for fold in fold_metrics
        ]

        auc_values = [
            fold["roc_auc"]
            for fold in fold_metrics
        ]


        accuracy_mean = np.mean(
            accuracy_values
        )

        accuracy_std = np.std(
            accuracy_values,
            ddof=1
        )


        f1_mean = np.mean(
            f1_values
        )

        f1_std = np.std(
            f1_values,
            ddof=1
        )


        auc_mean = np.mean(
            auc_values
        )

        auc_std = np.std(
            auc_values,
            ddof=1
        )


        print()
        print(model_name)

        print(
            f"  Accuracy : "
            f"{accuracy_mean:.4f} "
            f"+/- {accuracy_std:.4f}"
        )

        print(
            f"  F1       : "
            f"{f1_mean:.4f} "
            f"+/- {f1_std:.4f}"
        )

        print(
            f"  ROC-AUC  : "
            f"{auc_mean:.4f} "
            f"+/- {auc_std:.4f}"
        )


    print()
    print()
    print("=" * 70)
    print("VALIDATION COMPLETE")
    print("=" * 70)


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    main()