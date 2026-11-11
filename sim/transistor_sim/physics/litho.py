"""Lithography optics: the aerial image of a line/space mask (Fourier optics).

A periodic mask of pitch p diffracts light into orders at spatial frequencies
f_n = n/p. The projection lens passes only frequencies with
|f_n + f_s| ≤ NA/λ, where f_s is the tilt of the illuminating plane wave.
For one source point the image amplitude is Σ c_n P(f_n + f_s) e^{2πi f_n x};
partially coherent (Köhler) illumination adds the intensities of all source
points (Abbe's method; Hopkins 1953; Mack, Fundamental Principles of Optical
Lithography, 2007).

Source shapes (in units of NA/λ, 1D cut through a round pupil):
  conventional disk of radius σ — weight ∝ √(1 − (s/σ)²)
  dipole: two poles centred at ±σ_c with half-width σ_w
Defocus z multiplies each order by exp(iπλz f²) (paraxial).
Binary mask orders: c_0 = duty, c_n = sin(π n duty)/(π n).
Resolution limits: coherent light (σ = 0) images nothing below p = λ/NA;
the absolute limit with oblique illumination is p = λ/(2NA), i.e. k₁ = 0.25.
"""
from __future__ import annotations

import math

import numpy as np


def source_points(kind="conventional", sigma=0.5, sigma_c=0.7, sigma_w=0.1, n=41):
    """Source positions s (units of NA/λ) and weights."""
    if kind == "coherent" or (kind == "conventional" and sigma <= 1e-6):
        return np.array([0.0]), np.array([1.0])
    if kind == "conventional":
        s = np.linspace(-sigma, sigma, n)
        w = np.sqrt(np.clip(1 - (s / sigma) ** 2, 0, None))
    elif kind == "dipole":
        half = np.linspace(-sigma_w, sigma_w, n // 2)
        s = np.r_[-sigma_c + half, sigma_c + half]
        w = np.sqrt(np.clip(1 - (np.r_[half, half] / sigma_w) ** 2, 0, None))
    else:
        raise ValueError(kind)
    return s, w / w.sum()


def aerial_image(pitch_nm, lam_nm=193.0, NA=1.35, duty=0.5, kind="conventional", sigma=0.5,
                 sigma_c=0.7, sigma_w=0.1, defocus_nm=0.0, npts=256, periods=2, nmax=None):
    """Intensity across `periods` pitches (clear-field normalised to 1)."""
    x = np.linspace(0, periods * pitch_nm, npts)
    fc = NA / lam_nm
    if nmax is None:
        nmax = int(math.ceil(2 * fc * pitch_nm)) + 1
    ns = np.arange(-nmax, nmax + 1)
    fn = ns / pitch_nm
    c = np.where(ns == 0, duty, np.sin(math.pi * ns * duty) / (math.pi * np.where(ns == 0, 1, ns)))
    s, w = source_points(kind, sigma, sigma_c, sigma_w)
    I = np.zeros(npts)
    for si, wi in zip(s, w):
        fs = si * fc
        pas = np.abs(fn + fs) <= fc + 1e-12
        if not pas.any():
            continue
        phase = np.exp(1j * math.pi * lam_nm * defocus_nm * ((fn + fs) ** 2 - fs ** 2))
        amp = (c * pas * phase)[None, :] * np.exp(2j * math.pi * fn[None, :] * x[:, None])
        I += wi * np.abs(amp.sum(1)) ** 2
    return x, I


def contrast(I):
    return float((I.max() - I.min()) / (I.max() + I.min() + 1e-300))


def printed_cd(x, I, pitch_nm, threshold=0.3):
    """Width of the region above threshold within one pitch (nm): the printed space in positive resist."""
    per = x <= pitch_nm
    above = I[per] > threshold
    return float(above.mean() * pitch_nm)


def k1(pitch_nm, lam_nm, NA):
    return pitch_nm / 2 * NA / lam_nm


# --- Process-theatre helpers (v1.12) ----------------------------------------
# Rayleigh scaling (Levinson 2019; Mack 2007): half-pitch HP = k1·λ/NA and
# depth of focus DOF = k2·λ/NA². k1 and k2 are process factors, not constants.
# Photon counting (De Bisschop 2017): a dose D (mJ/cm²) of photons of energy
# E = hc/λ delivers N = D/E photons per unit area; Poisson statistics give a
# relative fluctuation 1/√N in any area. EUV photons carry ~14× the energy of
# ArF photons, so the same dose brings ~14× fewer of them.
HC_EV_NM = 6.62607015e-34 * 299792458.0 / 1.602176634e-19 * 1e9   # hc in eV·nm (SI 2019 exact constants; CODATA 2018)


def half_pitch(lam_nm, NA, k1=0.25):
    """Rayleigh half-pitch k1·λ/NA (nm)."""
    return k1 * lam_nm / NA


def depth_of_focus(lam_nm, NA, k2=1.0):
    """Rayleigh depth of focus k2·λ/NA² (nm)."""
    return k2 * lam_nm / NA ** 2


def photon_energy_ev(lam_nm):
    return HC_EV_NM / lam_nm


def photons_per_nm2(dose_mJ_cm2, lam_nm):
    """Incident photons per nm² for a dose in mJ/cm² (1 cm² = 1e14 nm²)."""
    joules_per_nm2 = dose_mJ_cm2 * 1e-3 / 1e14
    return joules_per_nm2 / (photon_energy_ev(lam_nm) * 1.602176634e-19)


def shot_noise(dose_mJ_cm2, lam_nm, side_nm):
    """Mean photon count and relative 1σ fluctuation in a square side_nm × side_nm."""
    n = photons_per_nm2(dose_mJ_cm2, lam_nm) * side_nm ** 2
    return n, 1.0 / math.sqrt(n)
