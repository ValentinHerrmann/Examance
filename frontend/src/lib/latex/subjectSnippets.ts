/**
 * Subject snippets of the palette (one tab per subject, MINT topics from LehrplanPLUS Gymnasium); labels in the `snippets`
 * i18n namespace. packages.sty preloads every package they use. Never write `${` in these String.raw templates.
 */
import { oneArgMacro, type QuickInsertMacro, type SubjectCategory } from "./quickInsertMacros";

const snippet =
  (category: SubjectCategory) =>
  (id: string, before: string, placeholder: string, after = ""): QuickInsertMacro =>
    oneArgMacro(id, before, placeholder, after, category);

const math = snippet("math");
const cs = snippet("cs");
const physics = snippet("physics");
const chemistry = snippet("chemistry");
const biology = snippet("biology");
const humanities = snippet("humanities");

export const SUBJECT_SNIPPETS: QuickInsertMacro[] = [
  // --- Mathematik ---
  math("math-pythagoras", "$", "a^2 + b^2 = c^2", "$"),
  math("math-set-n", String.raw`$\mathbb{`, "N", "}$"),
  math("math-set-z", String.raw`$\mathbb{`, "Z", "}$"),
  math("math-set-q", String.raw`$\mathbb{`, "Q", "}$"),
  math("math-set-r", String.raw`$\mathbb{`, "R", "}$"),
  math("math-set-c", String.raw`$\mathbb{`, "C", "}$"),
  math("math-fraction", String.raw`$\frac{`, "a", "}{b}$"),
  math("math-root", String.raw`$\sqrt{`, "x", "}$"),
  math("math-numberline", String.raw`\begin{tikzpicture}
  \draw[->] (-0.5,0) -- (`, "10.5", String.raw`,0);
  \foreach \x in {0,...,10} \draw (\x,0.1) -- (\x,-0.1) node[below] {\x};
\end{tikzpicture}`),
  math("math-grid", String.raw`\begin{tikzpicture}[scale=`, "0.5", String.raw`]
  \draw[very thin, gray!50] (-5,-5) grid (5,5);
  \draw[->] (-5.3,0) -- (5.5,0) node[right] {$x$};
  \draw[->] (0,-5.3) -- (0,5.5) node[above] {$y$};
  \foreach \x in {-4,-2,2,4} \node[below] at (\x,0) {\footnotesize $\x$};
  \foreach \y in {-4,-2,2,4} \node[left] at (0,\y) {\footnotesize $\y$};
\end{tikzpicture}`),
  math("math-histogram", String.raw`\begin{tikzpicture}[yscale=0.5]
  \draw[->] (0,0) -- (6.5,0) node[right] {Note};
  \draw[->] (0,0) -- (0,8.5) node[above] {Anzahl};
  \foreach \n/\h in {`, "1/2, 2/5, 3/8, 4/6, 5/3, 6/1", String.raw`}
    \draw[fill=gray!30] ({\n-0.9},0) rectangle ({\n-0.1},\h);
  \foreach \n in {1,...,6} \node[below] at ({\n-0.5},0) {\n};
  \foreach \y in {2,4,6,8} \node[left] at (0,\y) {\y};
\end{tikzpicture}`),
  math("math-boxplot", String.raw`\begin{tikzpicture}[yscale=0.5]
  \draw[->] (0,0) -- (0,10.8);
  \foreach \y in {0,2,...,10} \draw (0.1,\y) -- (-0.1,\y) node[left] {\y};
  \draw (0,0) -- (3.5,0);
  \foreach \x/\l/\mn/\qa/\me/\qb/\mx in {`, "1/Klasse A/1/3/5/7/9, 2.5/Klasse B/2/4/5/6/8", String.raw`} {
    \draw (\x,\mn) -- (\x,\qa) (\x,\qb) -- (\x,\mx);
    \draw (\x-0.2,\mn) -- (\x+0.2,\mn) (\x-0.2,\mx) -- (\x+0.2,\mx);
    \draw[fill=gray!20] (\x-0.4,\qa) rectangle (\x+0.4,\qb);
    \draw[thick] (\x-0.4,\me) -- (\x+0.4,\me);
    \node[below] at (\x,0) {\l};
  }
\end{tikzpicture}`),
  math("math-system", String.raw`\begin{align*}
  `, "2x + 3y &= 7", String.raw` \\
  x - y &= 1
\end{align*}`),
  math("math-triangle", String.raw`\begin{tikzpicture}
  \coordinate[label=below left:$A$] (A) at (0,0);
  \coordinate[label=below right:$B$] (B) at (5,0);
  \coordinate[label=above:$C$] (C) at (1.5,3);
  \draw (A) -- node[below] {$`, "c", String.raw`$} (B) -- node[above right] {$a$} (C) -- node[above left] {$b$} (A);
  \pic[draw, "$\alpha$", angle eccentricity=1.5] {angle = B--A--C};
  \pic[draw, "$\beta$", angle eccentricity=1.5] {angle = C--B--A};
  \pic[draw, "$\gamma$", angle eccentricity=1.5] {angle = A--C--B};
\end{tikzpicture}`),
  math("math-tree", String.raw`\begin{tikzpicture}[grow'=right, level distance=2.5cm, level 1/.style={sibling distance=2.4cm},
    level 2/.style={sibling distance=1.2cm}, prob/.style={fill=white, inner sep=1pt, font=\footnotesize}]
  \node[circle, fill, inner sep=1pt] {}
    child {node {$A$}
      child {node {$B$} edge from parent node[prob] {$0{,}5$}}
      child {node {$\overline{B}$} edge from parent node[prob] {$0{,}5$}}
      edge from parent node[prob] {$`, "0{,}6", String.raw`$}}
    child {node {$\overline{A}$}
      child {node {$B$} edge from parent node[prob] {$0{,}3$}}
      child {node {$\overline{B}$} edge from parent node[prob] {$0{,}7$}}
      edge from parent node[prob] {$0{,}4$}};
\end{tikzpicture}`),
  math("math-four-field", String.raw`\begin{tabular}{c|c|c|c}
   & $B$ & $\overline{B}$ & \\ \hline
  $A$ & $`, "0{,}2", String.raw`$ & & \\ \hline
  $\overline{A}$ & & & \\ \hline
   & & & $1$
\end{tabular}`),
  math("math-venn", String.raw`\begin{tikzpicture}
  \draw (0,0) rectangle (6,4);
  \node at (5.7,3.7) {$\Omega$};
  \draw (2.3,2) circle (1.3);
  \draw (3.7,2) circle (1.3);
  \node at (1.4,3.1) {$`, "A", String.raw`$};
  \node at (4.6,3.1) {$B$};
\end{tikzpicture}`),
  math("math-strahlensatz", String.raw`\begin{tikzpicture}
  \coordinate[label=left:$`, "Z", String.raw`$] (Z) at (0,0);
  \coordinate[label=above:$A$] (A) at (3,1.5);
  \coordinate[label=below:$B$] (B) at (3,-0.6);
  \coordinate[label=above:$A'$] (A2) at (6,3);
  \coordinate[label=below:$B'$] (B2) at (6,-1.2);
  \draw (Z) -- (A2);
  \draw (Z) -- (B2);
  \draw (A) -- (B);
  \draw (A2) -- (B2);
\end{tikzpicture}`),
  math("math-valuetable", String.raw`\begin{tabular}{|c|c|c|c|c|}
  \hline
  $x$ & `, "0 & 1 & 2 & 3", String.raw` \\ \hline
  $f(x)$ & & & & \\ \hline
\end{tabular}`),
  math("math-plot", String.raw`\begin{tikzpicture}[scale=0.8]
  \draw[->] (-3,0) -- (3,0) node[right] {$x$};
  \draw[->] (0,-1) -- (0,4) node[above] {$y$};
  \draw[thick, domain=-2:2, samples=50] plot (\x, {`, String.raw`(\x)^2`, String.raw`});
\end{tikzpicture}`),
  math("math-cases", String.raw`$f(x) = \begin{cases} `, String.raw`x^2 & x \geq 0 \\ -x & x < 0`, String.raw` \end{cases}$`),
  math("math-unit-circle", String.raw`\begin{tikzpicture}[scale=2]
  \draw[->] (-1.3,0) -- (1.3,0) node[right] {$x$};
  \draw[->] (0,-1.3) -- (0,1.3) node[above] {$y$};
  \draw (0,0) circle (1);
  \draw[thick] (0,0) -- (40:1) node[above right] {$`, "P", String.raw`$};
  \draw[very thick] (0,0) -- ({cos(40)},0) node[midway, below] {$\cos\alpha$};
  \draw[very thick] ({cos(40)},0) -- (40:1) node[midway, right] {$\sin\alpha$};
  \draw (0.3,0) arc (0:40:0.3);
  \node at (20:0.45) {$\alpha$};
\end{tikzpicture}`),
  math("math-tangent", String.raw`\begin{tikzpicture}
  \draw[->] (-0.5,0) -- (4.5,0) node[right] {$x$};
  \draw[->] (0,-0.5) -- (0,4.5) node[above] {$y$};
  \draw[thick, domain=0.2:4, samples=50] plot (\x, {0.25*(\x)^2+0.5});
  \draw[dashed, domain=0.5:3.8] plot (\x, {\x-0.5});
  \fill (2,1.5) circle (1.5pt) node[above left] {$`, "P", String.raw`$};
\end{tikzpicture}`),
  math("math-matrix", String.raw`$\begin{pmatrix} `, String.raw`1 & 2 \\ 3 & 4`, String.raw` \end{pmatrix}$`),
  math("math-vector", String.raw`$\vec{v} = \begin{pmatrix} `, String.raw`1 \\ 2 \\ 3`, String.raw` \end{pmatrix}$`),
  math("math-3d", String.raw`\begin{tikzpicture}[x={(-0.5cm,-0.5cm)}, y={(1cm,0cm)}, z={(0cm,1cm)}]
  \draw[->] (0,0,0) -- (4,0,0) node[below left] {$x_1$};
  \draw[->] (0,0,0) -- (0,4,0) node[right] {$x_2$};
  \draw[->] (0,0,0) -- (0,0,4) node[above] {$x_3$};
  \draw[thick, ->] (0,0,0) -- (2,3,2) node[above right] {$`, String.raw`\vec{v}`, String.raw`$};
  \draw[dashed] (2,3,2) -- (2,3,0) -- (2,0,0);
  \draw[dashed] (2,3,0) -- (0,3,0);
\end{tikzpicture}`),
  math("math-integral", String.raw`$\int_{a}^{b} `, "f(x)", String.raw`\,\mathrm{d}x$`),
  math("math-integral-area", String.raw`\begin{tikzpicture}[scale=0.8]
  \fill[gray!30, domain=1:3, samples=40] (1,0) -- plot (\x, {0.25*(\x)^2+1}) -- (3,0) -- cycle;
  \draw[->] (-0.5,0) -- (4.5,0) node[right] {$x$};
  \draw[->] (0,-0.5) -- (0,5.5) node[above] {$y$};
  \draw[thick, domain=0:4, samples=50] plot (\x, {0.25*(\x)^2+1}) node[right] {$`, "G_f", String.raw`$};
  \node[below] at (1,0) {$a$};
  \node[below] at (3,0) {$b$};
\end{tikzpicture}`),
  math("math-sum", String.raw`$\sum_{i=1}^{n} `, "i", "$"),
  math("math-normal", String.raw`\begin{tikzpicture}[xscale=1.2, yscale=6]
  \draw[->] (-3.3,0) -- (3.3,0) node[right] {$x$};
  \draw[->] (0,0) -- (0,0.5) node[above] {$\varphi(x)$};
  \draw[thick, domain=-3:3, samples=80] plot (\x, {exp(-(\x)^2/2)/sqrt(2*pi)});
  \node[below] at (0,0) {$`, String.raw`\mu`, String.raw`$};
\end{tikzpicture}`),

  // --- Informatik ---
  cs("cs-spreadsheet", String.raw`\begin{tabular}{|c|c|c|c|}
  \hline
   & A & B & C \\ \hline
  1 & Artikel & Preis & Menge \\ \hline
  2 & Cola & 1,50 & 3 \\ \hline
  3 & & & \texttt{`, "=B2*C2", String.raw`} \\ \hline
\end{tabular}`),
  cs("cs-dfd", String.raw`\begin{tikzpicture}[data/.style={draw, minimum width=1.6cm, minimum height=0.8cm},
    func/.style={draw, ellipse, minimum width=2.4cm}]
  \node[data] (a) at (-1.2,3) {12};
  \node[data] (b) at (1.2,3) {5};
  \node[func] (f) at (0,1.5) {`, "SUMME", String.raw`};
  \node[data] (r) at (0,0) {17};
  \draw[->] (a) -- (f);
  \draw[->] (b) -- (f);
  \draw[->] (f) -- (r);
\end{tikzpicture}`),
  cs("cs-schema", String.raw`\texttt{`, "Schueler", String.raw`}(\underline{id : int}, name : String, \dotuline{klasse\_id : int})`),
  cs("cs-db-table", String.raw`\begin{tabular}{c | c | c}
`, "id & name & alter", String.raw` \\ \hline\hline
1 & "Lia" & 15 \\ \hline
2 & "Ben" & 16
\end{tabular}`),
  cs("cs-sql-answer", String.raw`\LoesungLine{`, "SELECT name FROM Schueler WHERE alter > 15", "}{2}"),
  cs("cs-class-diagram", String.raw`\begin{tikzpicture}
  \begin{class}[text width=5cm]{Mensch}{0,0}
    \attribute{- String `, "name", String.raw`}
    \operation{+ String getName()}
  \end{class}
  \begin{class}[text width=5cm]{Schueler}{0,-4}
    \inherit{Mensch}
    \attribute{- int jahrgangsstufe}
  \end{class}
  \begin{class}[text width=5cm]{Schule}{8,-4}
    \attribute{- String name}
  \end{class}
  \unidirectionalAssociation{Schule}{schueler}{n}{Schueler}{}{}
\end{tikzpicture}`),
  cs("cs-object-diagram", String.raw`\begin{tikzpicture}[object/.style={draw, rounded corners, rectangle split, rectangle split parts=2, text width=4cm}]
  \node[object] (s) at (0,0) {\underline{`, "schueler1", String.raw` : Schueler} \nodepart{two} name = "Lia" \\ alter = 15};
  \node[object] (k) at (7,0) {\underline{klasse9a : Klasse} \nodepart{two} bezeichnung = "9a"};
  \draw[->] (k) -- node[above] {schueler} (s);
\end{tikzpicture}`),
  cs("cs-code", String.raw`\begin{framed}
\begin{lstlisting}[language=Java]
public class `, "Schueler", String.raw` {
    private String name;

    public String getName() {
        return name;
    }
}
\end{lstlisting}
\end{framed}`),
  cs("cs-gap-code", String.raw`\begin{framed}
\begin{lstlisting}
public class Schueler {

    private (*@\LoesungLuecke{`, "int", String.raw`}{3cm}@*) alter;

    private (*@\LoesungLuecke{String}{3cm}@*) name;
}
\end{lstlisting}
\end{framed}`),
  cs("cs-code-side-by-side", String.raw`\noindent
\begin{minipage}[t]{0.48\textwidth}
\begin{framed}
\begin{lstlisting}
public class `, "Mensch", String.raw` {
    private String name;
}
\end{lstlisting}
\end{framed}
\end{minipage}
\hfill
\begin{minipage}[t]{0.48\textwidth}
\begin{framed}
\begin{lstlisting}
public class Schueler extends Mensch {
    private int jahrgangsstufe;
}
\end{lstlisting}
\end{framed}
\end{minipage}`),
  cs("cs-array", String.raw`\begin{tikzpicture}
  \foreach \v [count=\i from 0] in {`, "3, 7, 1, 9", String.raw`} {
    \draw (\i,0) rectangle ++(1,1);
    \node at (\i+0.5,0.5) {\v};
    \node[below] at (\i+0.5,0) {\footnotesize \i};
  }
\end{tikzpicture}`),
  cs("cs-struktogramm", String.raw`\begin{struktogramm}(90,40)
  \assign{`, "i := 0", String.raw`}
  \while{i < 10}
    \assign{i := i + 1}
  \whileend
\end{struktogramm}`),
  cs("cs-er-diagram", String.raw`\begin{tikzpicture}[entity/.style={draw, minimum width=2.5cm, minimum height=1cm},
    relation/.style={draw, diamond, aspect=2}]
  \node[entity] (a) {`, "Lehrer", String.raw`};
  \node[relation, right=1.5cm of a] (r) {unterrichtet};
  \node[entity, right=1.5cm of r] (b) {Klasse};
  \draw (a) -- node[above] {n} (r) -- node[above] {m} (b);
\end{tikzpicture}`),
  cs("cs-graph", String.raw`\begin{tikzpicture}[vertex/.style={circle, draw, minimum size=8mm}, w/.style={fill=white, inner sep=1pt}]
  \node[vertex] (A) at (0,2) {A};
  \node[vertex] (B) at (3,2) {B};
  \node[vertex] (C) at (0,0) {C};
  \node[vertex] (D) at (3,0) {D};
  \draw (A) -- node[w] {`, "4", String.raw`} (B);
  \draw (A) -- node[w] {2} (C);
  \draw (B) -- node[w] {3} (D);
  \draw (C) -- node[w] {5} (D);
  \draw (A) -- node[w] {6} (D);
\end{tikzpicture}`),
  cs("cs-binary-tree", String.raw`\begin{tikzpicture}[level distance=1.3cm, level 1/.style={sibling distance=3cm},
    level 2/.style={sibling distance=1.5cm}, every node/.style={circle, draw, minimum size=7mm}]
  \node {`, "8", String.raw`}
    child {node {4} child {node {2}} child {node {6}}}
    child {node {12} child {node {10}} child {node {14}}};
\end{tikzpicture}`),
  cs("cs-automaton", String.raw`\begin{tikzpicture}[->, >=stealth, node distance=2.5cm, auto]
  \node[state, initial] (q0) {$q_0$};
  \node[state, accepting, right of=q0] (q1) {$q_1$};
  \path (q0) edge node {`, "a", String.raw`} (q1)
        (q1) edge[loop above] node {b} (q1);
\end{tikzpicture}`),
  cs("cs-logic-gates", String.raw`\begin{circuitikz}
  \draw (0,0) node[and port] (g1) {} (0,-2) node[not port] (g2) {} (3,-1) node[or port] (g3) {};
  \draw (g1.out) -- ++(0.4,0) |- (g3.in 1) (g2.out) -- ++(0.4,0) |- (g3.in 2);
  \draw (g1.in 1) node[left] {$A$} (g1.in 2) node[left] {$B$} (g2.in) node[left] {$C$};
  \draw (g3.out) node[right] {$`, "Y", String.raw`$};
\end{circuitikz}`),

  // --- Physik ---
  physics("phys-unit", "$", "9{,}81", String.raw`\,\mathrm{m/s^2}$`),
  physics("phys-lens", String.raw`\begin{tikzpicture}
  \draw[->] (-6,0) -- (6,0);
  \draw[thick, <->] (0,-2) -- (0,2);
  \fill (-2,0) circle (1.5pt) node[below] {$F$};
  \fill (2,0) circle (1.5pt) node[below] {$F'$};
  \draw[->, thick] (-5,0) -- (-5,1) node[above] {$`, "G", String.raw`$};
  \draw (-5,1) -- (0,1) -- (3.33,-0.67);
  \draw (-5,1) -- (3.33,-0.67);
  \draw (-5,1) -- (0,-0.67) -- (3.33,-0.67);
  \draw[->, thick] (3.33,0) -- (3.33,-0.67) node[below] {$B$};
\end{tikzpicture}`),
  physics("phys-circuit", String.raw`\begin{circuitikz}
  \draw (0,0) to[battery1, l=$U$] (0,3)
        to[switch] (3,3)
        to[R, l=$`, "R", String.raw`$] (6,3)
        to[lamp] (6,0) -- (0,0);
\end{circuitikz}`),
  physics("phys-incline", String.raw`\begin{tikzpicture}
  \draw (0,0) -- (6,0) -- (6,3) -- cycle;
  \begin{scope}[shift={(3.6,1.8)}, rotate=26.57]
    \draw[fill=gray!20] (-0.6,0) rectangle (0.6,0.8);
    \coordinate (S) at (0,0.4);
  \end{scope}
  \draw[->, thick] (S) -- ++(0,-2) node[below] {$\vec F_`, "G", String.raw`$};
  \draw[->, thick] (S) -- ++(116.57:1.8) node[above] {$\vec F_N$};
  \draw[->, thick] (S) -- ++(206.57:0.9) node[left] {$\vec F_H$};
  \draw (1,0) arc (0:26.57:1);
  \node at (1.3,0.25) {$\alpha$};
\end{tikzpicture}`),
  physics("phys-measurement", String.raw`\begin{tikzpicture}[scale=0.8]
  \draw[very thin, gray!40] (0,0) grid (8,6);
  \draw[->] (0,0) -- (8.5,0) node[right] {$U$ in V};
  \draw[->] (0,0) -- (0,6.5) node[above] {$I$ in mA};
  \foreach \x/\y in {`, "1/0.7, 2/1.6, 3/2.2, 4/3.1, 5/3.8, 6/4.6, 7/5.3", String.raw`}
    \fill (\x,\y) circle (2pt);
  \draw[dashed] (0,0) -- (8,6);
\end{tikzpicture}`),
  physics("phys-motion-graph", String.raw`\begin{tikzpicture}[scale=0.8]
  \draw[very thin, gray!40] (0,0) grid (8,5);
  \draw[->] (0,0) -- (8.5,0) node[right] {$t$ in s};
  \draw[->] (0,0) -- (0,5.5) node[above] {`, "$s$ in m", String.raw`};
  \draw[thick] (0,0) -- (4,3) -- (8,3);
\end{tikzpicture}`),
  physics("phys-energy-flow", String.raw`\begin{tikzpicture}[box/.style={draw, minimum width=2.8cm, minimum height=1cm, align=center}]
  \node[box] (in) at (0,0) {elektrische\\Energie};
  \node[box] (dev) at (4,0) {`, "Glühlampe", String.raw`};
  \node[box] (use) at (8,0.8) {Strahlungs-\\energie};
  \node[box] (loss) at (8,-0.8) {innere\\Energie};
  \draw[->, very thick] (in) -- (dev);
  \draw[->, very thick] (dev) -- (use);
  \draw[->, thick] (dev) -- (loss);
\end{tikzpicture}`),
  physics("phys-energy-levels", String.raw`\begin{tikzpicture}
  \draw[thick] (0,0) -- (4,0) node[right] {$E_1 = -13{,}6\,\mathrm{eV}$};
  \draw[thick] (0,2.5) -- (4,2.5) node[right] {$E_2 = -3{,}4\,\mathrm{eV}$};
  \draw[thick] (0,3.3) -- (4,3.3) node[right] {$E_3 = -1{,}5\,\mathrm{eV}$};
  \draw[thick] (0,3.8) -- (4,3.8) node[right] {$E_\infty = 0\,\mathrm{eV}$};
  \draw[->, thick] (2,3.3) -- (2,2.5) node[midway, right] {$`, String.raw`h \cdot f`, String.raw`$};
\end{tikzpicture}`),
  physics("phys-magnet", String.raw`\begin{tikzpicture}
  \fill[gray!60] (-1.5,-0.3) rectangle (0,0.3);
  \fill[gray!20] (0,-0.3) rectangle (1.5,0.3);
  \draw (-1.5,-0.3) rectangle (1.5,0.3);
  \node at (-0.75,0) {`, "N", String.raw`};
  \node at (0.75,0) {S};
  \foreach \h in {0.6,1.1,1.6} {
    \draw[->] (-1.5,0.1) .. controls (-2.5,\h+1) and (2.5,\h+1) .. (1.5,0.1);
    \draw[->] (-1.5,-0.1) .. controls (-2.5,-\h-1) and (2.5,-\h-1) .. (1.5,-0.1);
  }
\end{tikzpicture}`),
  physics("phys-e-field", String.raw`\begin{tikzpicture}
  \draw[very thick] (0,0) -- (0,3) node[above] {$+$};
  \draw[very thick] (4,0) -- (4,3) node[above] {$-$};
  \foreach \y in {0.5,1,...,2.5} \draw[->] (0,\y) -- (4,\y);
  \node at (2,-0.4) {$`, String.raw`\vec E`, String.raw`$};
\end{tikzpicture}`),
  physics("phys-oscillation", String.raw`\begin{tikzpicture}
  \draw[->] (0,0) -- (7,0) node[right] {$t$};
  \draw[->] (0,-1.5) -- (0,1.5) node[above] {$y$};
  \draw[thick, domain=0:6.5, samples=100] plot (\x, {sin(90*\x)});
  \draw[<->] (1,0) -- node[right] {$\hat y$} (1,1);
  \draw[<->] (1,1.3) -- node[above] {$`, "T", String.raw`$} (5,1.3);
\end{tikzpicture}`),
  physics("phys-decay-equation", String.raw`\ce{`, "^{238}_{92}U -> ^{234}_{90}Th + ^{4}_{2}He", "}"),
  physics("phys-decay-curve", String.raw`\begin{tikzpicture}
  \draw[->] (0,0) -- (8.5,0) node[right] {$t$ in a};
  \draw[->] (0,0) -- (0,4.5) node[above] {$N$};
  \draw[thick, domain=0:8, samples=60] plot (\x, {4*exp(-0.3466*\x)});
  \draw[dashed] (0,2) -- (2,2) -- (2,0) node[below] {$`, "T_{1/2}", String.raw`$};
  \draw[dashed] (0,1) -- (4,1) -- (4,0) node[below] {$2T_{1/2}$};
  \node[left] at (0,4) {$N_0$};
  \node[left] at (0,2) {$\frac{N_0}{2}$};
\end{tikzpicture}`),

  // --- Chemie ---
  chemistry("chem-formula", "", "H$_2$O"),
  chemistry("chem-reaction", String.raw`\ce{`, "2 H2 + O2 -> 2 H2O", "}"),
  chemistry("chem-gap-reaction", String.raw`\ce{Zn + 2 HCl ->} \LoesungLuecke{`, String.raw`\ce{ZnCl2 + H2}`, "}{4cm}"),
  chemistry("chem-energy-diagram", String.raw`\begin{tikzpicture}
  \draw[->] (0,0) -- (8,0) node[below left] {Reaktionsverlauf};
  \draw[->] (0,0) -- (0,5) node[above] {$E$};
  \draw[thick] (0.5,3) -- (2,3) .. controls (3,3) and (3,4.6) .. (4,4.6) .. controls (5,4.6) and (5,1.5) .. (6,1.5) -- (7.5,1.5);
  \draw[thick, dashed] (2,3) .. controls (3,3) and (3,3.8) .. (4,3.8) .. controls (5,3.8) and (5,1.5) .. (6,1.5);
  \draw[dotted] (2,3) -- (7,3);
  \draw[<->] (4.3,3) -- (4.3,4.6) node[midway, right] {$E_A$};
  \draw[<->] (7,3) -- (7,1.5) node[midway, right] {$\Delta_r H$};
  \node[above] at (1.2,3) {`, "Edukte", String.raw`};
  \node[below] at (6.7,1.5) {Produkte};
\end{tikzpicture}`),
  chemistry("chem-shell-model", String.raw`\begin{tikzpicture}
  \fill[gray!40] (0,0) circle (0.35);
  \node at (0,0) {\footnotesize `, "10+", String.raw`};
  \draw (0,0) circle (0.9);
  \draw (0,0) circle (1.5);
  \foreach \a in {0,180} \fill (\a:0.9) circle (2pt);
  \foreach \a in {0,45,...,315} \fill (\a:1.5) circle (2pt);
\end{tikzpicture}`),
  chemistry("chem-electron-config", "$", String.raw`1s^2\,2s^2\,2p^6`, "$"),
  chemistry("chem-periodic-table", String.raw`\begin{tabular}{|c|c|c|c|c|c|c|c|}
  \hline
  I & II & III & IV & V & VI & VII & VIII \\ \hline
  H & & & & & & & He \\ \hline
  `, "Li & Be & B & C & N & O & F & Ne", String.raw` \\ \hline
  Na & Mg & Al & Si & P & S & Cl & Ar \\ \hline
\end{tabular}`),
  chemistry("chem-ions", String.raw`\ce{`, "Ag+ + Cl- -> AgCl v", "}"),
  chemistry("chem-structure", String.raw`\chemfig{`, "H-C(-[2]H)(-[6]H)-C(-[2]H)(-[6]H)-O-H", "}"),
  chemistry("chem-lewis", String.raw`\chemfig{`, String.raw`H-\charge{90=\|,270=\|}{O}-H`, "}"),
  chemistry("chem-redox", String.raw`\begin{align*}
  \text{Oxidation:}\quad & \overset{0}{\ce{`, "Cu", String.raw`}} \ce{->} \overset{+\mathrm{II}}{\ce{Cu^2+}} + 2\,\ce{e-} \\
  \text{Reduktion:}\quad & \overset{+\mathrm{I}}{\ce{Ag+}} + \ce{e-} \ce{->} \overset{0}{\ce{Ag}}
\end{align*}`),
  chemistry("chem-equilibrium", String.raw`\ce{`, "N2 + 3 H2 <=> 2 NH3", "}"),
  chemistry("chem-titration", String.raw`\begin{tikzpicture}[scale=0.4]
  \draw[->] (0,0) -- (21,0) node[right] {$V$ in mL};
  \draw[->] (0,0) -- (0,14.5) node[above] {pH};
  \foreach \y in {2,4,...,14} \node[left] at (0,\y) {\footnotesize \y};
  \draw[thick] (0,1) .. controls (8,1.6) and (9.5,2.5) .. (10,7) .. controls (10.5,11.5) and (12,12.4) .. (20,12.8);
  \draw[dashed] (10,0) -- (10,7) -- (0,7);
  \fill (10,7) circle (2pt) node[right] {`, "Äquivalenzpunkt", String.raw`};
\end{tikzpicture}`),
  chemistry("chem-benzene", String.raw`\chemfig{`, "*6(=-=-=-)", "}"),
  chemistry("chem-fischer", String.raw`\chemfig{`, "CHO-[6]C(-[4]H)(-[0]OH)-[6]CH_2OH", "}"),

  // --- Biologie ---
  biology("bio-sketch", String.raw`\begin{tikzpicture}
  \draw[thick] (0,0) rectangle (3,2);
  \draw[->] (3.5,1) -- (5,1) node[right] {`, "Beschriftung", String.raw`};
\end{tikzpicture}`),
  biology("bio-food-chain", String.raw`\begin{tikzpicture}[node distance=1.2cm, box/.style={draw, rounded corners, minimum height=0.8cm}]
  \node[box] (a) {`, "Gras", String.raw`};
  \node[box, right=of a] (b) {Hase};
  \node[box, right=of b] (c) {Fuchs};
  \draw[->, thick] (a) -- (b);
  \draw[->, thick] (b) -- (c);
\end{tikzpicture}`),
  biology("bio-bar-chart", String.raw`\begin{tikzpicture}
  \draw[->] (0,0) -- (5,0);
  \draw[->] (0,0) -- (0,4.5) node[above] {Anzahl};
  \foreach \x/\h/\l in {`, "1/3/A, 2/4/B, 3/1.5/C, 4/2.5/D", String.raw`} {
    \draw[fill=gray!30] (\x-0.35,0) rectangle (\x+0.35,\h);
    \node[below] at (\x,0) {\l};
  }
\end{tikzpicture}`),
  biology("bio-pie-chart", String.raw`\begin{tikzpicture}
  \foreach \a/\b/\l in {`, String.raw`0/144/40\,\%, 144/252/30\,\%, 252/360/30\,\%`, String.raw`} {
    \draw[fill=gray!20] (0,0) -- (\a:2) arc (\a:\b:2) -- cycle;
    \node at ({(\a+\b)/2}:1.3) {\l};
  }
\end{tikzpicture}`),
  biology("bio-regulation", String.raw`\begin{tikzpicture}[node distance=1.2cm, box/.style={draw, rounded corners, minimum width=3cm, minimum height=0.9cm, align=center}]
  \node[box] (ist) {`, "Blutzuckerspiegel", String.raw`};
  \node[box, right=2cm of ist] (f) {Fühler};
  \node[box, below=of f] (r) {Regler};
  \node[box, below=of ist] (s) {Stellglied};
  \draw[->] (ist) -- (f);
  \draw[->] (f) -- node[right] {Istwert} (r);
  \draw[->] (r) -- (s);
  \draw[->] (s) -- (ist);
  \draw[<-] (r.east) -- ++(1,0) node[right] {Sollwert};
  \draw[<-] (ist.west) -- ++(-1,0) node[left] {Störgröße};
\end{tikzpicture}`),
  biology("bio-dna", String.raw`\begin{tabular}{l l}
  DNA (codogener Strang): & \texttt{`, "TAC GGA TTC", String.raw`} \\
  mRNA: & \LoesungLuecke{\texttt{AUG CCU AAG}}{4cm} \\
  Aminosäuren: & \LoesungLuecke{Met -- Pro -- Lys}{4cm}
\end{tabular}`),
  biology("bio-punnett", String.raw`{\renewcommand{\arraystretch}{1.6}\begin{tabular}{c|>{\centering\arraybackslash}p{1.5cm}|>{\centering\arraybackslash}p{1.5cm}}
   & $`, "A", String.raw`$ & $a$ \\ \hline
  $A$ & \LoesungLeer{$AA$}{0pt} & \LoesungLeer{$Aa$}{0pt} \\ \hline
  $a$ & \LoesungLeer{$Aa$}{0pt} & \LoesungLeer{$aa$}{0pt}
\end{tabular}}`),
  biology("bio-pedigree", String.raw`\begin{tikzpicture}[male/.style={draw, minimum size=6mm}, female/.style={draw, circle, minimum size=6mm},
    affected/.style={fill=gray!70}]
  \node at (-1.5,0) {`, "I", String.raw`};
  \node at (-1.5,-1.6) {II};
  \node[male] (v) at (0,0) {};
  \node[female, affected] (m) at (2,0) {};
  \draw (v) -- (m);
  \draw (1,0) -- (1,-1);
  \draw (-0.5,-1) -- (2.5,-1);
  \node[female] (k1) at (-0.5,-1.6) {};
  \node[male, affected] (k2) at (1,-1.6) {};
  \node[female] (k3) at (2.5,-1.6) {};
  \foreach \k in {k1,k2,k3} \draw (\k.north) -- ++(0,0.3);
\end{tikzpicture}`),
  biology("bio-enzyme", String.raw`\begin{tikzpicture}
  \draw[->] (0,0) -- (7,0) node[right] {`, "Temperatur", String.raw`};
  \draw[->] (0,0) -- (0,4) node[above] {Enzymaktivität};
  \draw[thick] (0.5,0.2) .. controls (3,0.5) and (3.2,3.4) .. (4,3.4) .. controls (4.8,3.4) and (5,0.5) .. (5.8,0.1);
  \draw[dashed] (4,0) node[below] {Optimum} -- (4,3.4);
\end{tikzpicture}`),
  biology("bio-gel", String.raw`\begin{tikzpicture}
  \foreach \i/\l in {`, "0/M, 1/A, 2/B, 3/C", String.raw`} {
    \draw (\i*1.2,0) rectangle ++(1,-5);
    \node[above] at (\i*1.2+0.5,0) {\l};
  }
  \foreach \i/\y in {0/-1, 0/-2, 0/-3, 0/-4, 1/-1.5, 1/-3, 2/-2, 2/-3.5, 3/-1.5, 3/-3}
    \fill (\i*1.2+0.15,\y) rectangle ++(0.7,-0.15);
\end{tikzpicture}`),
  biology("bio-cladogram", String.raw`\begin{tikzpicture}
  \draw (0,3) -- (0.75,2.25) -- (1.5,3);
  \draw (0.75,2.25) -- (1.5,1.5) -- (3,3);
  \draw (1.5,1.5) -- (2.25,0.75) -- (4.5,3);
  \draw (2.25,0.75) -- (2.6,0.4);
  \foreach \x/\n in {`, "0/Mensch, 1.5/Schimpanse, 3/Gorilla, 4.5/Orang-Utan", String.raw`}
    \node[above, font=\footnotesize] at (\x,3) {\n};
\end{tikzpicture}`),
  biology("bio-action-potential", String.raw`\begin{tikzpicture}[xscale=1.2, yscale=0.04]
  \draw[->] (0,-100) -- (0,50) node[above] {`, "$U$ in mV", String.raw`};
  \draw[->] (0,-100) -- (6,-100) node[right] {$t$ in ms};
  \draw[dashed] (0,0) -- (6,0) node[right] {\footnotesize 0};
  \draw[dotted] (0,-55) -- (1.3,-55);
  \draw[thick] (0,-70) -- (1,-70) -- (1.3,-55) .. controls (1.6,40) and (1.8,40) .. (2.1,0)
    .. controls (2.4,-80) and (2.7,-85) .. (3.2,-80) .. controls (3.8,-72) .. (6,-70);
  \node[left] at (0,-75) {\footnotesize $-70$};
  \node[left] at (0,-50) {\footnotesize Schwelle};
\end{tikzpicture}`),
  biology("bio-population", String.raw`\begin{tikzpicture}
  \draw[->] (0,0) -- (8,0) node[right] {Zeit};
  \draw[->] (0,0) -- (0,4.5) node[above] {`, "Individuenzahl", String.raw`};
  \draw[dashed] (0,3.5) -- (7.5,3.5) node[right] {$K$};
  \draw[thick, domain=0:7.5, samples=60] plot (\x, {3.5/(1+30*exp(-1.2*\x))});
\end{tikzpicture}`),

  // --- Sprachen & Gesellschaft ---
  humanities("lang-source-text", String.raw`\begin{lstlisting}[language={}, numbers=left, stepnumber=5, firstnumber=1, basicstyle=\normalfont, columns=fullflexible, keepspaces]
`, "Text der Quelle", String.raw`
\end{lstlisting}
\begin{flushright}\footnotesize Quelle: Autor, Titel, Jahr\end{flushright}`),
  humanities("lang-cloze", String.raw`Der Hund \LoesungLuecke{`, "bellt", String.raw`}{2cm} laut, weil er \LoesungLuecke{Hunger}{2cm} hat.`),
  humanities("lang-matching", String.raw`\begin{tabular}{ll@{\hspace{2cm}}ll}
  1 & `, "Begriff", String.raw` & A & Erklärung \\
  2 & Begriff & B & Erklärung \\
  3 & Begriff & C & Erklärung
\end{tabular}

{\renewcommand{\arraystretch}{1.6}\begin{tabular}{|*{3}{>{\centering\arraybackslash}p{1cm}|}}
  \hline
  1 & 2 & 3 \\ \hline
  \LoesungLeer{B}{0pt} & \LoesungLeer{C}{0pt} & \LoesungLeer{A}{0pt} \\ \hline
\end{tabular}}`),
  humanities("lang-vocabulary", String.raw`{\renewcommand{\arraystretch}{1.6}\begin{tabular}{|l|p{5cm}|}
  \hline
  \textbf{Deutsch} & \textbf{Englisch} \\ \hline
  `, "der Hund", String.raw` & \LoesungLeer{the dog}{0pt} \\ \hline
  die Katze & \LoesungLeer{the cat}{0pt} \\ \hline
\end{tabular}}`),
  humanities("lang-gap-table", String.raw`{\renewcommand{\arraystretch}{1.6}\begin{tabular}{|l|p{6cm}|}
  \hline
  `, "Begriff", String.raw` & \LoesungLeer{Antwort}{0pt} \\ \hline
  Begriff & \LoesungLeer{Antwort}{0pt} \\ \hline
\end{tabular}}`),
  humanities("lang-timeline", String.raw`\begin{tikzpicture}
  \draw[->, thick] (0,0) -- (12,0);
  \foreach \x/\j/\e in {`, String.raw`1/1789/Französische Revolution, 5/1871/Reichsgründung, 9/1918/Ende des 1.\ Weltkriegs`, String.raw`} {
    \draw (\x,0.15) -- (\x,-0.15) node[below] {\j};
    \node[above, align=center, text width=2.5cm] at (\x,0.2) {\footnotesize \e};
  }
\end{tikzpicture}`)
];
