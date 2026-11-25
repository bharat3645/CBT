/**
 * Demo question bank (60 questions: 20 each for Physics, Chemistry, Maths) and the syllabus tree they are tagged to.
 * Line format:  topic | difficulty | answer | stem | optA | optB | optC | optD
 * `answer` is a letter A-D for MCQ; a number for a numeric question (no options). `$...$` is LaTeX.
 */
export type Difficulty = "easy" | "medium" | "hard";
export interface BankQuestion {
  subject: "Physics" | "Chemistry" | "Maths";
  topic: string;
  difficulty: Difficulty;
  stem: string;
  options?: string[];
  /** index into options (MCQ) */
  correct?: number;
  /** numeric answer */
  numeric?: number;
}

const PHYSICS = String.raw`
Motion in a straight line|easy|B|A car accelerates uniformly from rest to $20\ \text{m/s}$ in $5\ \text{s}$. The distance covered in this time is|40 m|50 m|100 m|20 m
Motion in a straight line|easy|B|A body is thrown vertically upward with $u = 30\ \text{m/s}$. Taking $g = 10\ \text{m/s}^2$, the maximum height reached is|30 m|45 m|60 m|90 m
Motion in a straight line|medium|7|A particle starts from rest with a uniform acceleration of $2\ \text{m/s}^2$. Its displacement (in m) during the $4^{\text{th}}$ second is
Projectile motion|easy|A|A projectile is launched at $45^\circ$ with speed $u$. Its horizontal range is|$u^2/g$|$u^2/2g$|$2u^2/g$|$u^2/4g$
Projectile motion|medium|B|A projectile is launched with $u = 20\ \text{m/s}$ at $30^\circ$ to the horizontal ($g = 10\ \text{m/s}^2$). The time of flight is|1 s|2 s|4 s|$2\sqrt{3}$ s
Projectile motion|medium|A|Two projectiles have the same speed and are launched at angles $\theta$ and $(90^\circ - \theta)$. The ratio of their horizontal ranges is|$1:1$|$\sin\theta : \cos\theta$|$\tan\theta : 1$|$1 : \tan\theta$
Newton's laws|easy|B|A net force of $20\ \text{N}$ acts on a $5\ \text{kg}$ block. Its acceleration is|$2\ \text{m/s}^2$|$4\ \text{m/s}^2$|$5\ \text{m/s}^2$|$100\ \text{m/s}^2$
Newton's laws|medium|B|Masses $m_1 = 2\ \text{kg}$ and $m_2 = 3\ \text{kg}$ hang over a light frictionless pulley (Atwood machine). The acceleration of the system is ($g = 10\ \text{m/s}^2$)|$1\ \text{m/s}^2$|$2\ \text{m/s}^2$|$5\ \text{m/s}^2$|$10\ \text{m/s}^2$
Newton's laws|medium|C|A lift moves upward with acceleration $2\ \text{m/s}^2$. The apparent weight of a $60\ \text{kg}$ person is ($g = 10\ \text{m/s}^2$)|480 N|600 N|720 N|120 N
Friction|easy|B|A $10\ \text{kg}$ block rests on a rough floor with $\mu_s = 0.4$ ($g = 10\ \text{m/s}^2$). The minimum horizontal force needed to start it moving is|4 N|40 N|400 N|25 N
Friction|medium|A|A block slides down a rough incline of angle $30^\circ$ with constant velocity. The coefficient of kinetic friction is|$1/\sqrt{3}$|$\sqrt{3}$|$1/2$|$1/\sqrt{2}$
Work-energy theorem|easy|B|Work of $100\ \text{J}$ is done on a $2\ \text{kg}$ body initially at rest. Its final speed is|5 m/s|10 m/s|50 m/s|100 m/s
Work-energy theorem|easy|B|A spring of constant $k = 200\ \text{N/m}$ is compressed by $0.1\ \text{m}$. The energy stored is|0.5 J|1 J|2 J|10 J
Work-energy theorem|medium|20|A $0.5\ \text{kg}$ ball falls from rest through $20\ \text{m}$ ($g = 10\ \text{m/s}^2$). Its speed just before reaching the ground (in m/s) is
Coulomb's law|easy|B|The force between two point charges is $F$. If the distance between them is doubled, the force becomes|$F/2$|$F/4$|$2F$|$4F$
Coulomb's law|hard|C|Charges $+4\ \mu\text{C}$ and $+1\ \mu\text{C}$ are placed $1\ \text{m}$ apart. The electric field is zero on the line joining them at a distance from the $4\ \mu\text{C}$ charge of|$1/3$ m|$1/2$ m|$2/3$ m|$3/4$ m
Capacitors|easy|A|Capacitors of $3\ \mu\text{F}$ and $6\ \mu\text{F}$ are connected in series. The equivalent capacitance is|$2\ \mu\text{F}$|$9\ \mu\text{F}$|$4.5\ \mu\text{F}$|$18\ \mu\text{F}$
Capacitors|medium|50|A $10\ \mu\text{F}$ capacitor is charged to $100\ \text{V}$. The energy stored (in mJ) is
Ohm's law|easy|A|Resistors of $4\ \Omega$ and $12\ \Omega$ are connected in parallel. The equivalent resistance is|$3\ \Omega$|$8\ \Omega$|$16\ \Omega$|$6\ \Omega$
Ohm's law|medium|C|A wire of resistance $R$ is uniformly stretched to double its length (volume constant). Its new resistance is|$R$|$2R$|$4R$|$R/2$
`;

const CHEMISTRY = String.raw`
Stoichiometry|easy|B|The number of moles in $22\ \text{g}$ of $\text{CO}_2$ (molar mass $44\ \text{g/mol}$) is|0.25|0.5|1|2
Stoichiometry|easy|C|The volume occupied at STP by $2$ mol of an ideal gas is|11.2 L|22.4 L|44.8 L|67.2 L
Stoichiometry|medium|36|The mass of water (in g) formed on complete combustion of $2$ mol of $\text{H}_2$ ($2\text{H}_2 + \text{O}_2 \to 2\text{H}_2\text{O}$) is
Concentration terms|medium|B|The molarity of a solution containing $4\ \text{g}$ of NaOH (molar mass $40$) in $500\ \text{mL}$ is|0.1 M|0.2 M|0.4 M|2 M
Concentration terms|medium|125|The volume (in mL) of $2\ \text{M}$ HCl required to prepare $500\ \text{mL}$ of $0.5\ \text{M}$ HCl is
First law|easy|B|For the isothermal expansion of an ideal gas, $\Delta U$ is|positive|zero|negative|equal to $q$
First law|easy|A|A system absorbs $200\ \text{J}$ of heat and does $80\ \text{J}$ of work. The change in internal energy is|120 J|280 J|$-120$ J|80 J
First law|medium|C|In an adiabatic process, $\Delta U$ equals|$q$|$-w$|$w$|zero always
Entropy and Gibbs energy|easy|B|A reaction is spontaneous at all temperatures when|$\Delta H > 0,\ \Delta S < 0$|$\Delta H < 0,\ \Delta S > 0$|$\Delta H > 0,\ \Delta S > 0$|$\Delta H < 0,\ \Delta S < 0$
Entropy and Gibbs energy|medium|C|At equilibrium, the change in Gibbs energy $\Delta G$ of the reaction is|positive|negative|zero|equal to $\Delta G^\circ$
Entropy and Gibbs energy|hard|400|A reaction has $\Delta H = 40\ \text{kJ/mol}$ and $\Delta S = 100\ \text{J/mol K}$. The temperature (in K) above which it becomes spontaneous is
Inductive and resonance effects|easy|D|Which of the following is the strongest acid?|$\text{CH}_3\text{COOH}$|$\text{ClCH}_2\text{COOH}$|$\text{Cl}_2\text{CHCOOH}$|$\text{Cl}_3\text{CCOOH}$
Inductive and resonance effects|easy|C|Which group shows a $+R$ (electron-donating resonance) effect?|$-\text{NO}_2$|$-\text{CHO}$|$-\text{OH}$|$-\text{COOH}$
Inductive and resonance effects|medium|C|Which of the following is the weakest base in aqueous solution?|$\text{CH}_3\text{NH}_2$|$(\text{CH}_3)_2\text{NH}$|$\text{C}_6\text{H}_5\text{NH}_2$|$\text{NH}_3$
Reaction intermediates|easy|D|Which carbocation is the most stable?|Methyl|Ethyl|Isopropyl|tert-Butyl
Reaction intermediates|easy|B|The hybridisation of the carbon atom in $\text{CH}_3^+$ is|$sp$|$sp^2$|$sp^3$|$dsp^2$
Reaction intermediates|medium|B|A carbanion is stabilised by|electron-donating groups|electron-withdrawing groups|alkyl groups|none of these
Hybridisation|easy|B|The shape of the $\text{NH}_3$ molecule is|planar triangular|trigonal pyramidal|tetrahedral|linear
Hybridisation|medium|C|The hybridisation of sulphur in $\text{SF}_6$ is|$sp^3$|$sp^3d$|$sp^3d^2$|$sp^3d^3$
Hybridisation|hard|C|Which molecule has a bond angle closest to $90^\circ$?|$\text{H}_2\text{O}$|$\text{NH}_3$|$\text{H}_2\text{S}$|$\text{CH}_4$
`;

const MATHS = String.raw`
Limits|easy|C|$\displaystyle\lim_{x\to 0}\frac{\sin 3x}{x}$ equals|0|1|3|$1/3$
Limits|easy|C|$\displaystyle\lim_{x\to 2}\frac{x^2 - 4}{x - 2}$ equals|0|2|4|$\infty$
Limits|medium|B|$\displaystyle\lim_{x\to 0}\frac{1 - \cos x}{x^2}$ equals|0|$1/2$|1|2
Derivatives|medium|B|$\dfrac{d}{dx}\left(x^3 \ln x\right)$ equals|$3x^2 \ln x$|$x^2 + 3x^2 \ln x$|$x^2 \ln x + 3x^2$|$3x\ln x + x$
Derivatives|medium|B|If $y = e^{2x}\sin x$, then $\dfrac{dy}{dx}$ at $x = 0$ is|0|1|2|3
Derivatives|easy|9|The slope of the tangent to $y = x^3 - 3x$ at $x = 2$ is
Definite integrals|easy|C|$\displaystyle\int_0^1 x\,dx$ equals|1|2|$1/2$|0
Definite integrals|easy|C|$\displaystyle\int_0^{\pi} \sin x\,dx$ equals|0|1|2|$\pi$
Definite integrals|medium|10|$\displaystyle\int_0^2 (3x^2 + 1)\,dx$ equals
Area under curves|easy|C|The area under $y = x^2$ from $x = 0$ to $x = 3$ is|3|6|9|27
Area under curves|medium|A|The area enclosed between $y = x$ and $y = x^2$ is|$1/6$|$1/3$|$1/2$|$1/4$
Area under curves|hard|C|The total area bounded by $y = \sin x$ and the $x$-axis from $0$ to $2\pi$ is|0|2|4|$2\pi$
Roots of quadratics|easy|B|The sum of the roots of $x^2 - 5x + 6 = 0$ is|$-5$|5|6|$-6$
Roots of quadratics|easy|D|The product of the roots of $2x^2 + 3x - 5 = 0$ is|$5/2$|$3/2$|$-3/2$|$-5/2$
Roots of quadratics|medium|A|If $2$ is a root of $x^2 + px + 6 = 0$, then $p$ equals|$-5$|5|$-3$|3
Nature of roots|easy|C|The roots of $x^2 - 4x + 4 = 0$ are|complex|real and distinct|real and equal|irrational
Nature of roots|medium|B|For $k > 0$, the equation $x^2 + kx + 9 = 0$ has equal roots when $k$ equals|3|6|9|12
Circles|easy|A|The centre of the circle $x^2 + y^2 - 4x + 6y - 12 = 0$ is|$(2, -3)$|$(-2, 3)$|$(4, -6)$|$(-4, 6)$
Circles|medium|C|The radius of the circle $x^2 + y^2 - 4x + 6y - 12 = 0$ is|3|4|5|6
Circles|hard|4|The length of the tangent from the point $(5, 0)$ to the circle $x^2 + y^2 = 9$ is
`;

function parse(subject: BankQuestion["subject"], block: string): BankQuestion[] {
  return block.trim().split("\n").map((line) => {
    const [topic, difficulty, answer, stem, ...opts] = line.split("|");
    const q: BankQuestion = { subject, topic: topic!, difficulty: difficulty as Difficulty, stem: stem! };
    if (opts.length) {
      q.options = opts;
      q.correct = "ABCD".indexOf(answer!);
      if (q.correct < 0 || opts.length !== 4) throw new Error(`Bad bank line: ${line}`);
    } else {
      q.numeric = Number(answer);
      if (!Number.isFinite(q.numeric)) throw new Error(`Bad bank line: ${line}`);
    }
    return q;
  });
}

export const BANK: BankQuestion[] = [...parse("Physics", PHYSICS), ...parse("Chemistry", CHEMISTRY), ...parse("Maths", MATHS)];

/** subject -> unit -> chapter -> topics. The topic names above must appear here. */
export const SYLLABUS: Record<string, Record<string, Record<string, string[]>>> = {
  Physics: {
    Mechanics: {
      Kinematics: ["Motion in a straight line", "Projectile motion"],
      "Laws of Motion": ["Newton's laws", "Friction"],
      "Work, Energy and Power": ["Work-energy theorem"],
    },
    Electrodynamics: {
      Electrostatics: ["Coulomb's law", "Capacitors"],
      "Current Electricity": ["Ohm's law"],
    },
  },
  Chemistry: {
    "Physical Chemistry": {
      "Mole Concept": ["Stoichiometry", "Concentration terms"],
      Thermodynamics: ["First law", "Entropy and Gibbs energy"],
    },
    "Organic Chemistry": {
      "General Organic Chemistry": ["Inductive and resonance effects", "Reaction intermediates"],
    },
    "Inorganic Chemistry": { "Chemical Bonding": ["Hybridisation"] },
  },
  Maths: {
    Calculus: {
      "Limits and Continuity": ["Limits"],
      Differentiation: ["Derivatives"],
      Integration: ["Definite integrals", "Area under curves"],
    },
    Algebra: { "Quadratic Equations": ["Roots of quadratics", "Nature of roots"] },
    "Coordinate Geometry": { Circles: ["Circles"] },
  },
};
